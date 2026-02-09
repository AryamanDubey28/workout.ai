import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { deleteWorkout, initDatabase, updateWorkout } from '@/lib/db';
import { Workout } from '@/types/workout';

// DELETE /api/workouts/[id] - Delete a specific workout
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

    const { id: workoutId } = await params;

    if (!workoutId) {
      return NextResponse.json(
        { error: 'Workout ID is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteWorkout(session.userId, workoutId);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Workout not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Workout deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting workout:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/workouts/[id] - Update a specific workout
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

    const { id: workoutId } = await params;

    if (!workoutId) {
      return NextResponse.json(
        { error: 'Workout ID is required' },
        { status: 400 }
      );
    }

    const body: Partial<Workout> = await request.json();

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDate = Object.prototype.hasOwnProperty.call(body, 'date');
    const hasExercises = Object.prototype.hasOwnProperty.call(body, 'exercises');
    const hasNote = Object.prototype.hasOwnProperty.call(body, 'note');

    // Validate that at least one field is being updated
    if (!hasName && !hasDate && !hasExercises && !hasNote) {
      return NextResponse.json(
        { error: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }

    const workoutUpdates: Partial<Workout> = { updatedAt: new Date() };

    if (hasName) {
      workoutUpdates.name = typeof body.name === 'string' ? body.name.trim() : '';
    }

    if (hasDate) {
      if (!body.date) {
        return NextResponse.json(
          { error: 'Invalid date provided' },
          { status: 400 }
        );
      }

      const parsedDate = new Date(body.date);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date provided' },
          { status: 400 }
        );
      }

      workoutUpdates.date = parsedDate;
    }

    if (hasExercises) {
      if (!Array.isArray(body.exercises)) {
        return NextResponse.json(
          { error: 'Exercises must be an array' },
          { status: 400 }
        );
      }
      workoutUpdates.exercises = body.exercises;
    }

    if (hasNote) {
      workoutUpdates.note = typeof body.note === 'string' ? body.note.trim() : '';
    }

    const updatedWorkout = await updateWorkout(session.userId, workoutId, workoutUpdates);
    
    if (!updatedWorkout) {
      return NextResponse.json(
        { error: 'Workout not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Workout updated successfully',
      workout: updatedWorkout
    });

  } catch (error) {
    console.error('Error updating workout:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
