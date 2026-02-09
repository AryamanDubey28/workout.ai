import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, reorderWorkoutPresets } from '@/lib/db';

// PUT /api/presets/reorder - Reorder presets (defines split cycle order)
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

    if (!Array.isArray(body.presetIds) || body.presetIds.length === 0) {
      return NextResponse.json(
        { error: 'presetIds must be a non-empty array' },
        { status: 400 }
      );
    }

    const success = await reorderWorkoutPresets(session.userId, body.presetIds);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to reorder presets' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Presets reordered successfully' });
  } catch (error) {
    console.error('Error reordering presets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
