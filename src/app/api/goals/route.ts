import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getMacroGoal, upsertMacroGoal, initDatabase } from '@/lib/db';

// GET /api/goals - Get user's macro goals
export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const goal = await getMacroGoal(session.userId);
    return NextResponse.json({ goal });
  } catch (error) {
    console.error('Error getting goals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/goals - Update user's macro goals
export async function PUT(request: NextRequest) {
  try {
    await initDatabase();

    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { goalType, calories, protein, carbs, fat, heightCm, activityLevel, sex } = body;

    if (!goalType || calories == null || protein == null || carbs == null || fat == null) {
      return NextResponse.json(
        { error: 'Missing required fields: goalType, calories, protein, carbs, fat' },
        { status: 400 }
      );
    }

    const goal = await upsertMacroGoal(session.userId, {
      goalType,
      calories,
      protein,
      carbs,
      fat,
      heightCm,
      activityLevel,
      sex,
    });

    if (!goal) {
      return NextResponse.json({ error: 'Failed to save goals' }, { status: 500 });
    }

    return NextResponse.json({ goal });
  } catch (error) {
    console.error('Error saving goals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
