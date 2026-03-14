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
import {
  formatWorkoutsForContext,
  formatMealsForContext,
  formatMealHistoryForContext,
  formatGoalForContext,
  formatUserFactsForContext,
  formatUserProfileForContext,
  formatHealthMetricsForContext,
} from '@/lib/chatContext';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const currentDateUtcIso = now.toISOString();
    const currentDateUtcLong = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoKey = twoWeeksAgo.toISOString().split('T')[0];

    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoKey = oneWeekAgo.toISOString().split('T')[0];

    // Fetch the same context as the chat agent
    const [userProfile, workouts, todayMeals, mealHistory, macroGoal, userFacts, aiSoul, healthMetrics] = await Promise.all([
      getUserById(session.userId),
      getUserWorkouts(session.userId),
      getUserMealsByDate(session.userId, todayKey),
      getUserMealsForDateRange(session.userId, twoWeeksAgoKey, todayKey),
      getMacroGoal(session.userId),
      getUserFacts(session.userId),
      getAiSoul(session.userId),
      getDailyHealthMetrics(session.userId, oneWeekAgoKey, todayKey),
    ]);

    const userProfileContext = formatUserProfileForContext(userProfile, macroGoal);
    const workoutContext = formatWorkoutsForContext(workouts);
    const mealContext = formatMealsForContext(todayMeals);
    const mealHistoryContext = formatMealHistoryForContext(mealHistory, todayKey);
    const goalContext = formatGoalForContext(macroGoal);
    const factsContext = formatUserFactsForContext(userFacts);
    const healthContext = formatHealthMetricsForContext(healthMetrics);

    // Build personality section — same as chat agent
    const personalitySection = aiSoul
      ? `\n--- PERSONALITY ---\n${aiSoul.soulContent}\nStay in this personality at ALL times. Every response should reflect this voice and coaching style.\n--- END PERSONALITY ---\n`
      : '';

    const defaultTone = aiSoul
      ? ''
      : '\nBe concise, friendly, and helpful. Reference specific workouts, meals, and goals when relevant. If they ask about progress, analyze trends in their data. If they ask about nutrition, factor in their goal type, remaining macros for the day, and recent eating patterns from the meal history. Keep responses focused and practical.\n';

    // Same context as chat agent, with voice-specific preamble
    const systemMessage = `You are a knowledgeable fitness and workout assistant for ${session.name}. You have access to their profile metrics (age, weight, height, sex, activity level), their complete workout history (including workout notes), today's meals, the past 2 weeks of meal history, and their nutrition goals. You can provide advice on training, form, programming, recovery, and nutrition.
Keep your answers extremely concise because you are speaking them aloud over an audio connection. Use short sentences. Do not use markdown or formatting — plain speech only.
${personalitySection}
Current date context: ${currentDateUtcLong} (UTC date key: ${todayKey}, UTC timestamp: ${currentDateUtcIso}). Use this to reason about recency and interpret terms like today, yesterday, and last workout.
Unit rules: bodyweight in the user profile is stored in pounds (lb). Workout exercise loads are stored in kilograms (kg), unless marked as Bodyweight/BW. Keep those units accurate in responses.

User profile:
${userProfileContext}
${factsContext ? `\nPersonal context about this user:\n${factsContext}\nUse these facts to personalize your responses — reference injuries, dietary needs, goals, and preferences naturally.\n` : ''}${userFacts.length < 3 ? `\nYou don't know much about this user yet. When it feels natural (not forced), ask a friendly question to learn about them — their fitness background, injuries, dietary preferences, goals, or lifestyle. Don't ask more than one discovery question per message, and only when contextually appropriate.\n` : ''}
${healthContext}

Here is their complete workout history (progression summary first, then recent workouts in detail, then older workouts in compact format):
${workoutContext}

Today's meals:
${mealContext}

Meal history (past 2 weeks, each line is one day with daily totals and individual meals):
${mealHistoryContext}

${goalContext}
${defaultTone}`;

    // Setup Tools
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
    ];

    // Try /v1/realtime/sessions first (beta), fall back to /v1/realtime/client_secrets (GA)
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
