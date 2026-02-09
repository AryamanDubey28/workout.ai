import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { deleteWorkoutPreset, initDatabase, updateWorkoutPreset } from '@/lib/db';

// PUT /api/presets/[id] - Update a preset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await initDatabase();

    const { id: presetId } = await params;

    if (!presetId) {
      return NextResponse.json(
        { error: 'Preset ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasExercises = Object.prototype.hasOwnProperty.call(body, 'exercises');
    const hasSortOrder = Object.prototype.hasOwnProperty.call(body, 'sortOrder');

    if (!hasName && !hasExercises && !hasSortOrder) {
      return NextResponse.json(
        { error: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (hasName) updates.name = typeof body.name === 'string' ? body.name.trim() : body.name;
    if (hasExercises) updates.exercises = body.exercises;
    if (hasSortOrder) updates.sortOrder = body.sortOrder;

    const updatedPreset = await updateWorkoutPreset(session.userId, presetId, updates);

    if (!updatedPreset) {
      return NextResponse.json(
        { error: 'Preset not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({ preset: updatedPreset });
  } catch (error) {
    console.error('Error updating preset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/presets/[id] - Delete a preset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await initDatabase();

    const { id: presetId } = await params;

    if (!presetId) {
      return NextResponse.json(
        { error: 'Preset ID is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteWorkoutPreset(session.userId, presetId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Preset not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Preset deleted successfully' });
  } catch (error) {
    console.error('Error deleting preset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
