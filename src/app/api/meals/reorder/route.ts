import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, reorderMeals } from '@/lib/db';

// PUT /api/meals/reorder - Reorder meals (update sort_order and category)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await initDatabase();

    const body = await request.json();

    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json(
        { error: 'updates must be a non-empty array' },
        { status: 400 }
      );
    }

    const success = await reorderMeals(session.userId, body.updates);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to reorder meals' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Meals reordered successfully' });
  } catch (error) {
    console.error('Error reordering meals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
