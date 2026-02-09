import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getUserWorkouts } from '@/lib/db';
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
      return `${date} - ${name}:\n${exercises}`;
    })
    .join('\n\n');
}

// POST /api/chat - Chat with AI about workouts
export async function POST(request: NextRequest) {
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

    // Fetch user's recent workouts for context
    const workouts = await getUserWorkouts(session.userId);
    const workoutContext = formatWorkoutsForContext(workouts);

    const systemMessage = `You are a knowledgeable fitness and workout assistant for ${session.name}. You have access to their recent workout history and can provide advice on training, form, programming, recovery, and nutrition.

Here are their recent workouts:
${workoutContext}

Be concise, friendly, and helpful. Reference specific workouts and exercises when relevant. If they ask about progress, analyze trends in their data. Keep responses focused and practical.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: systemMessage },
        ...messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    return NextResponse.json({ message: content });
  } catch (error: any) {
    console.error('Error in chat:', error);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 });
  }
}
