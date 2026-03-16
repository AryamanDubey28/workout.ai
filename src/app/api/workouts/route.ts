import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { createWorkout, getUserWorkouts, initDatabase, getUserWorkoutCount, getLastProgressionAnalysis } from '@/lib/db';
import { Workout } from '@/types/workout';
import { computeRecommendationsForWorkout } from '@/lib/progressionEngine';
import { runProgressionTuningAgent } from '@/lib/agents/progressionTuningAgent';

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

    await initDatabase();

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
    if (!body.id || !body.date || !Array.isArray(body.exercises)) {
      return NextResponse.json(
        { error: 'Missing required fields: id, date, exercises' },
        { status: 400 }
      );
    }

    // Validate run data if type is 'run'
    if (body.type === 'run' && (!body.runData || typeof body.runData.distanceKm !== 'number' || typeof body.runData.durationSeconds !== 'number')) {
      return NextResponse.json(
        { error: 'Run workouts require runData with distanceKm and durationSeconds' },
        { status: 400 }
      );
    }

    const workoutName = typeof body.name === 'string' ? body.name.trim() : '';
    const workoutNote = typeof body.note === 'string' ? body.note.trim() : '';

    const workout: Workout = {
      ...body,
      name: workoutName || undefined,
      note: workoutNote || undefined,
      type: body.type || 'strength',
      runData: body.runData || undefined,
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

    // Fire-and-forget: compute progressive overload recommendations
    computeRecommendationsForWorkout(session.userId, createdWorkout).catch(err =>
      console.error('Recommendation compute error:', err)
    );

    // Fire-and-forget: trigger AI progression tuning agent (throttled)
    (async () => {
      try {
        const [workoutCount, lastAnalyzed] = await Promise.all([
          getUserWorkoutCount(session.userId),
          getLastProgressionAnalysis(session.userId),
        ]);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (workoutCount % 5 === 0 && (!lastAnalyzed || lastAnalyzed < sevenDaysAgo)) {
          runProgressionTuningAgent(session.userId).catch(err =>
            console.error('Progression tuning agent error:', err)
          );
        }
      } catch (err) {
        console.error('Progression agent trigger check error:', err);
      }
    })();

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
