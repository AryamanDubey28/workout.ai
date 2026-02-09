import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { createWorkoutPreset, getUserPresets, initDatabase } from '@/lib/db';

// GET /api/presets - Get all presets for the authenticated user
export async function GET() {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await initDatabase();

    const presets = await getUserPresets(session.userId);

    return NextResponse.json({ presets });
  } catch (error) {
    console.error('Error getting presets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/presets - Create a new preset
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body.id || !body.name || !body.exercises) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, exercises' },
        { status: 400 }
      );
    }

    // Auto-assign sort_order if not provided
    const existingPresets = await getUserPresets(session.userId);
    const sortOrder = body.sortOrder ?? existingPresets.length;

    const preset = await createWorkoutPreset(session.userId, {
      id: body.id,
      name: body.name.trim(),
      exercises: body.exercises,
      sortOrder,
    });

    if (!preset) {
      return NextResponse.json(
        { error: 'Failed to create preset' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preset });
  } catch (error) {
    console.error('Error creating preset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
