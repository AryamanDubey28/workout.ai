import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { createMeal, getUserMealsByDate, initDatabase } from '@/lib/db';

// GET /api/meals?date=YYYY-MM-DD - Get meals for a specific date
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date parameter required' }, { status: 400 });
    }

    const meals = await getUserMealsByDate(session.userId, date);

    // Calculate daily totals
    const totals = meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.macros.calories,
        protein: acc.protein + meal.macros.protein,
        carbs: acc.carbs + meal.macros.carbs,
        fat: acc.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({ meals, totals, date });
  } catch (error) {
    console.error('Error getting meals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/meals - Create a new meal
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { id, description, macros, category, imageUrl, date } = body;

    if (!id || !description || !macros || !category || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: id, description, macros, category, date' },
        { status: 400 }
      );
    }

    const meal = await createMeal(session.userId, { id, description, macros, category, imageUrl, date });

    if (!meal) {
      return NextResponse.json({ error: 'Failed to create meal' }, { status: 500 });
    }

    return NextResponse.json({ meal });
  } catch (error) {
    console.error('Error creating meal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
