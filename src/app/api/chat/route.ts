import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getUserById, getUserWorkouts, getUserMealsByDate, getMacroGoal } from '@/lib/db';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function formatWorkoutsForContext(workouts: any[]): string {
  if (workouts.length === 0) return 'No workouts recorded yet.';

  // Take the most recent 10 workouts
  const recent = workouts.slice(0, 10);

  return recent
    .map((w) => {
      const date = new Date(w.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const name = w.name || 'Untitled';
      const note = typeof w.note === 'string' ? w.note.trim() : '';
      const exercises = w.exercises
        .map((ex: any) => {
          const weight = ex.weight === 'BW' ? 'Bodyweight' : ex.weight ? `${ex.weight}kg` : '';
          if (ex.useEffectiveReps) {
            return `  - ${ex.name} ${weight} ${ex.effectiveRepsMax}/${ex.effectiveRepsTarget} ER`;
          }
          if (ex.repsPerSet && ex.repsPerSet.length > 0) {
            const sets = ex.repsPerSet.length;
            const repsStr = ex.repsPerSet.join(', ');
            return `  - ${ex.name} ${weight} ${sets} sets (${repsStr} reps)`;
          }
          return `  - ${ex.name} ${weight} ${ex.sets || 0}x${ex.reps || 0}`;
        })
        .join('\n');
      const noteLine = note ? `  Note: ${note}\n` : '';
      return `${date} - ${name}:\n${noteLine}${exercises}`;
    })
    .join('\n\n');
}

function formatMealsForContext(meals: any[]): string {
  if (meals.length === 0) return 'No meals logged today.';

  const mealLines = meals.map((m) => {
    return `  - ${m.description}: ${m.macros.calories} cal, ${m.macros.protein}g protein, ${m.macros.carbs}g carbs, ${m.macros.fat}g fat`;
  });

  const totals = meals.reduce(
    (acc: any, m: any) => ({
      calories: acc.calories + m.macros.calories,
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return `${mealLines.join('\n')}\n  Total so far: ${totals.calories} cal, ${totals.protein}g protein, ${totals.carbs}g carbs, ${totals.fat}g fat`;
}

function formatGoalForContext(goal: any): string {
  if (!goal) return 'No macro goals set.';
  return `Goal: ${goal.goalType} - ${goal.calories} cal, ${goal.protein}g protein, ${goal.carbs}g carbs, ${goal.fat}g fat daily`;
}

function formatBodyweightForContext(rawWeight: unknown): string {
  const weightLbs = Number(rawWeight);
  if (!Number.isFinite(weightLbs)) return 'unknown';

  const weightKg = weightLbs * 0.45359237;
  const lbs = Number.isInteger(weightLbs) ? `${weightLbs}` : weightLbs.toFixed(1);
  const kg = weightKg.toFixed(1);
  return `${lbs} lb (${kg} kg)`;
}

function formatUserProfileForContext(user: any, goal: any): string {
  if (!user) {
    return 'Age: unknown. Weight: unknown. Height: not set. Sex: not set. Activity level: not set.';
  }

  const age = user.age ?? 'unknown';
  const weight = formatBodyweightForContext(user.weight);
  const height = goal?.heightCm ? `${goal.heightCm} cm` : 'not set';
  const sex = goal?.sex || 'not set';
  const activityLevel = goal?.activityLevel || 'not set';

  return `Age: ${age}. Weight: ${weight}. Height: ${height}. Sex: ${sex}. Activity level: ${activityLevel}.`;
}

function logOpenAIError(context: string, error: any, meta?: Record<string, any>) {
  const err = error ?? {};
  const details = {
    context,
    ...meta,
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    type: err?.type,
    request_id: err?.request_id ?? err?.headers?.['x-request-id'],
    error_message: err?.error?.message,
    error_type: err?.error?.type,
    error_code: err?.error?.code,
  };

  console.error('OpenAI error:', details);
  if (err?.cause) {
    console.error('OpenAI error cause:', err.cause);
  }
}

// POST /api/chat - Chat with AI about workouts
export async function POST(request: NextRequest) {
  let logMeta: Record<string, any> | undefined;
  try {
    const openai = getOpenAI();
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    logMeta = {
      userId: session.userId,
      messageCount: messages.length,
      messageRoles: messages.map((m: any) => m?.role).filter(Boolean),
    };

    // Fetch context in parallel
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
    const [userProfile, workouts, todayMeals, macroGoal] = await Promise.all([
      getUserById(session.userId),
      getUserWorkouts(session.userId),
      getUserMealsByDate(session.userId, todayKey),
      getMacroGoal(session.userId),
    ]);

    const userProfileContext = formatUserProfileForContext(userProfile, macroGoal);
    const workoutContext = formatWorkoutsForContext(workouts);
    const mealContext = formatMealsForContext(todayMeals);
    const goalContext = formatGoalForContext(macroGoal);

    const systemMessage = `You are a knowledgeable fitness and workout assistant for ${session.name}. You have access to their profile metrics (age, weight, height, sex, activity level), recent workout history (including workout notes), today's meals, and their nutrition goals. You can provide advice on training, form, programming, recovery, and nutrition.

Current date context: ${currentDateUtcLong} (UTC date key: ${todayKey}, UTC timestamp: ${currentDateUtcIso}). Use this to reason about recency and interpret terms like today, yesterday, and last workout.
Unit rules: bodyweight in the user profile is stored in pounds (lb). Workout exercise loads are stored in kilograms (kg), unless marked as Bodyweight/BW. Keep those units accurate in responses.

User profile:
${userProfileContext}

Here are their recent workouts:
${workoutContext}

Today's meals:
${mealContext}

${goalContext}

Be concise, friendly, and helpful. Reference specific workouts, meals, and goals when relevant. If they ask about progress, analyze trends in their data. If they ask about nutrition, factor in their goal type and remaining macros for the day. Keep responses focused and practical.

Formatting rules: Output plain text only. Do not use Markdown or special characters for formatting. Avoid headings, bullet points, bold/italics, code blocks, and lists with dashes. Do not use these characters for formatting: # * \` - >. If you need structure, use short labels like "Strength and performance trends:" followed by full sentences, or use simple numbered items like "1." "2." "3." with no extra symbols.`;

    const model = 'gpt-5.2';
    logMeta = {
      ...logMeta,
      model,
      systemMessageLength: systemMessage.length,
    };
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        ...messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    return NextResponse.json({ message: content });
  } catch (error: any) {
    logOpenAIError('chat', error, logMeta);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 });
  }
}
