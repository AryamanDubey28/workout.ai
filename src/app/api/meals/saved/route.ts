import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, createSavedMeal, getUserSavedMeals } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    const savedMeals = await getUserSavedMeals(session.userId);

    return NextResponse.json({ savedMeals });
  } catch (error) {
    console.error('Error getting saved meals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const body = await request.json();
    const { id, name, description, macros } = body;

    if (!id || !name?.trim() || !description || !macros) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, description, macros' },
        { status: 400 }
      );
    }

    const savedMeal = await createSavedMeal(session.userId, {
      id,
      name: name.trim(),
      description,
      macros,
    });

    if (!savedMeal) {
      return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 });
    }

    return NextResponse.json({ savedMeal });
  } catch (error) {
    console.error('Error creating saved meal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
