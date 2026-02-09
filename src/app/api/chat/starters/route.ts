import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSessionFromCookie } from '@/lib/auth';
import { getMacroGoal, getUserMealsByDate, getUserWorkouts } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STARTER_COUNT = 3;
const FALLBACK_STARTERS = [
  'What should I train today?',
  'How can I improve my squat?',
  'What is my weekly progress trend?',
  'Suggest a recovery plan for tomorrow',
  'How can I break my plateau?',
  'Plan a 45 minute workout',
  'How should I adjust my macros?',
  'What should my next deload look like?',
  'Which muscle groups am I neglecting?',
];

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function pickFallbackStarters(count = STARTER_COUNT) {
  const shuffled = [...FALLBACK_STARTERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function normalizeStarter(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .trim()
    .replace(/^[-*0-9.)\s]+/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');

  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

function parseStarterResponse(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const toStarters = (values: unknown[]): string[] =>
    values
      .map((value) => normalizeStarter(value))
      .filter((value): value is string => Boolean(value));

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return toStarters(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).starters)) {
      return toStarters((parsed as any).starters);
    }
  } catch (_) {
    // Fall through to line parsing.
  }

  return cleaned
    .split('\n')
    .map((line) => normalizeStarter(line))
    .filter((value): value is string => Boolean(value));
}

function finalizeStarters(candidates: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
    if (unique.length === STARTER_COUNT) return unique;
  }

  for (const fallback of pickFallbackStarters(STARTER_COUNT * 2)) {
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(fallback);
    if (unique.length === STARTER_COUNT) break;
  }

  return unique.slice(0, STARTER_COUNT);
}

function formatStarterContext(workouts: any[], meals: any[], macroGoal: any): string {
  const recentWorkouts =
    workouts.length === 0
      ? 'No workouts logged yet.'
      : workouts
          .slice(0, 5)
          .map((workout) => {
            const date = new Date(workout.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            const name = workout.name || 'Untitled';
            const note = typeof workout.note === 'string' ? workout.note.trim() : '';
            const exerciseNames = Array.isArray(workout.exercises)
              ? workout.exercises
                  .slice(0, 3)
                  .map((exercise: any) => exercise?.name)
                  .filter(Boolean)
                  .join(', ')
              : '';
            return `${date}: ${name}${exerciseNames ? ` (${exerciseNames})` : ''}${note ? ` | note: ${note.slice(0, 120)}` : ''}`;
          })
          .join('\n');

  const todayMealSummary =
    meals.length === 0
      ? 'No meals logged today.'
      : `${meals.length} meals logged today.`;

  const goalSummary = macroGoal
    ? `${macroGoal.goalType} goal, ${macroGoal.calories} calories, ${macroGoal.protein}g protein.`
    : 'No macro goal set.';

  return `Recent workouts:\n${recentWorkouts}\n\nMeals:\n${todayMealSummary}\n\nGoal:\n${goalSummary}`;
}

function logStarterError(error: any, meta?: Record<string, any>) {
  const err = error ?? {};
  console.error('Starter generation error:', {
    ...meta,
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    request_id: err?.request_id ?? err?.headers?.['x-request-id'],
  });
}

// POST /api/chat/starters - Generate dynamic chat starters
export async function POST() {
  const fallbackSuggestions = pickFallbackStarters();

  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing');
      return NextResponse.json({ suggestions: fallbackSuggestions });
    }

    const todayKey = new Date().toISOString().split('T')[0];
    const [workouts, todayMeals, macroGoal] = await Promise.all([
      getUserWorkouts(session.userId),
      getUserMealsByDate(session.userId, todayKey),
      getMacroGoal(session.userId),
    ]);

    const context = formatStarterContext(workouts, todayMeals, macroGoal);
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      temperature: 1,
      max_completion_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You generate short conversation starter chips for a fitness assistant app. Return valid JSON only in the shape {"starters":["...","...","..."]}. Exactly 3 unique starters. Each starter must be under 9 words, direct, practical, and plain text.',
        },
        {
          role: 'user',
          content: `Generate 3 fresh starter questions for ${session.name}. Vary wording from common defaults and tailor them to this context.\n\n${context}\n\nNonce: ${Date.now()}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ suggestions: fallbackSuggestions });
    }

    const suggestions = finalizeStarters(parseStarterResponse(content));
    return NextResponse.json({ suggestions });
  } catch (error: any) {
    logStarterError(error);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ suggestions: fallbackSuggestions }, { status: 200 });
    }

    return NextResponse.json({ suggestions: fallbackSuggestions }, { status: 200 });
  }
}
