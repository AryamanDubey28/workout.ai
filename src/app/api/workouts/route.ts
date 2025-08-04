import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { createWorkout, getUserWorkouts, initDatabase } from '@/lib/db';
import { Workout } from '@/types/workout';

// GET /api/workouts - Get all workouts for the authenticated user
export async function GET() {
  try {
    const session = await getSessionFromCookie();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const workouts = await getUserWorkouts(session.userId);
    
    return NextResponse.json({ workouts });
  } catch (error) {
    console.error('Error getting workouts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/workouts - Create a new workout
export async function POST(request: NextRequest) {
  try {
    // Initialize database if not already done
    await initDatabase();
    
    const session = await getSessionFromCookie();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body: Workout = await request.json();

    // Validate required fields
    if (!body.id || !body.date || !body.exercises) {
      return NextResponse.json(
        { error: 'Missing required fields: id, date, exercises' },
        { status: 400 }
      );
    }

    // Convert date string to Date object if needed
    const workout: Workout = {
      ...body,
      date: new Date(body.date),
      createdAt: new Date(body.createdAt),
      updatedAt: new Date(body.updatedAt),
    };

    const createdWorkout = await createWorkout(session.userId, workout);
    
    if (!createdWorkout) {
      return NextResponse.json(
        { error: 'Failed to create workout' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Workout created successfully',
      workout: createdWorkout
    });

  } catch (error) {
    console.error('Error creating workout:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}