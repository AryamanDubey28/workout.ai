import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { deleteWorkout, updateWorkout } from '@/lib/db';
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

    const { id: workoutId } = await params;

    if (!workoutId) {
      return NextResponse.json(
        { error: 'Workout ID is required' },
        { status: 400 }
      );
    }

    const body: Partial<Workout> = await request.json();

    // Validate that at least one field is being updated
    if (!body.name && !body.date && !body.exercises) {
      return NextResponse.json(
        { error: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }

    // Convert date string to Date object if provided
    const workoutUpdates: Partial<Workout> = {
      ...body,
      date: body.date ? new Date(body.date) : undefined,
      updatedAt: new Date(),
    };

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