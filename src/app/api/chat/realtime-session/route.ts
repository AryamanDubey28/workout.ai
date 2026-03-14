import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  initDatabase,
  getUserById,
  getUserWorkouts,
  getUserMealsByDate,
  getUserMealsForDateRange,
  getMacroGoal,
  getUserFacts,
  getAiSoul,
  getDailyHealthMetrics,
} from '@/lib/db';
import OpenAI from 'openai';
import { UserFact } from '@/types/user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Re-using context formatters from chat/route.ts (simplified for voice context)

function formatBodyweightForContext(rawWeight: unknown): string {
  const weightLbs = Number(rawWeight);
  if (!Number.isFinite(weightLbs)) return 'unknown';
  const weightKg = weightLbs * 0.45359237;
  return `${Number.isInteger(weightLbs) ? String(weightLbs) : weightLbs.toFixed(1)} lb (${weightKg.toFixed(1)} kg)`;
}

function formatUserProfileForContext(user: any, goal: any): string {
  if (!user) return 'Age: unknown. Weight: unknown. Height: not set. Sex: not set. Activity level: not set.';
  return `Age: ${user.age ?? 'unknown'}. Weight: ${formatBodyweightForContext(user.weight)}. Height: ${goal?.heightCm ? `${goal.heightCm} cm` : 'not set'}. Sex: ${goal?.sex || 'not set'}. Activity level: ${goal?.activityLevel || 'not set'}.`;
}

function formatGoalForContext(goal: any): string {
  if (!goal) return 'No macro goals set.';
  return `Goal: ${goal.goalType} - ${goal.calories} cal, ${goal.protein}g protein, ${goal.carbs}g carbs, ${goal.fat}g fat daily`;
}

function formatMealsForContext(meals: any[]): string {
  if (!meals || meals.length === 0) return 'No meals logged today.';
  const mealLines = meals.map(m => `  - ${m.description}: ${m.macros.calories} cal, ${m.macros.protein}g protein`);
  const totals = meals.reduce((acc, m) => ({ calories: acc.calories + m.macros.calories, protein: acc.protein + m.macros.protein }), { calories: 0, protein: 0 });
  return `${mealLines.join('\\n')}\\n  Total so far: ${totals.calories} cal, ${totals.protein}g protein`;
}

function formatUserFactsForContext(facts: UserFact[]): string {
  if (!facts || facts.length === 0) return '';
  return facts.map(f => `- [${f.category}] ${f.content}`).join('\\n');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    await initDatabase();

    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];

    // Fetch essential context for voice mode
    const [userProfile, todayMeals, macroGoal, userFacts, aiSoul] = await Promise.all([
      getUserById(session.userId),
      getUserMealsByDate(session.userId, todayKey),
      getMacroGoal(session.userId),
      getUserFacts(session.userId),
      getAiSoul(session.userId),
    ]);

    const userProfileContext = formatUserProfileForContext(userProfile, macroGoal);
    const mealContext = formatMealsForContext(todayMeals);
    const goalContext = formatGoalForContext(macroGoal);
    const factsContext = formatUserFactsForContext(userFacts);

    const personalitySection = aiSoul
      ? `\\n--- PERSONALITY ---\\n${aiSoul.soulContent}\\nStay in this personality at ALL times. Every response should reflect this voice and coaching style.\\n--- END PERSONALITY ---\\n`
      : '\\nBe concise, friendly, and helpful.\\n';

    const systemMessage = `You are a knowledgeable fitness and voice assistant for ${session.name}. 
Keep your answers extremely concise because you are speaking them aloud over an audio connection. 
${personalitySection}

User profile:
${userProfileContext}
${factsContext ? `\nPersonal context about this user:\n${factsContext}\n` : ''}

Today's meals:
${mealContext}

${goalContext}`;

    // Setup Tools for LangGraph
    const tools = [
      {
        type: 'function',
        name: 'log_meal',
        description: 'Logs a user meal to the database. Call this when the user tells you they ate something.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'The food the user ate' },
          },
          required: ['description'],
        },
      },
      // You can expand with more tools here
    ];

    // Try /v1/realtime/sessions first (beta), fall back to /v1/realtime/client_secrets (GA)
    // Attempt 1: /v1/realtime/sessions (flat params)
    let response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'alloy',
      })
    });

    if (!response.ok) {
      const err1 = await response.text();
      console.error('sessions endpoint failed, trying client_secrets:', err1);

      // Attempt 2: /v1/realtime/client_secrets (GA nested format)
      response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: 'gpt-realtime',
          }
        })
      });

      if (!response.ok) {
        const err2 = await response.text();
        console.error('client_secrets endpoint also failed:', err2);
        return NextResponse.json({ error: `Failed to create ephemeral token. Attempt 1: ${err1} | Attempt 2: ${err2}` }, { status: 500 });
      }
    }

    const data = await response.json();
    const secret = data.client_secret?.value ?? data.client_secret;
    return NextResponse.json({
      client_secret: secret,
      instructions: systemMessage,
      tools,
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
