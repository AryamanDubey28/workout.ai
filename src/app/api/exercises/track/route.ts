import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { createOrUpdateExercisePattern } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { exerciseName, exerciseData } = body;
    
    if (!exerciseName || typeof exerciseName !== 'string') {
      return NextResponse.json({ error: 'Exercise name is required' }, { status: 400 });
    }

    // Handle backward compatibility and new repsPerSet structure
    const processedExerciseData = { ...exerciseData };
    
    // If we have repsPerSet, we might want to store some derived values for autocomplete
    if (processedExerciseData.repsPerSet && Array.isArray(processedExerciseData.repsPerSet)) {
      // Store the most common rep count as the default reps for autocomplete
      const repCounts = processedExerciseData.repsPerSet.reduce((acc: Record<number, number>, reps: number) => {
        acc[reps] = (acc[reps] || 0) + 1;
        return acc;
      }, {});
      
      const mostCommonReps = Object.entries(repCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0];
      
      if (mostCommonReps) {
        processedExerciseData.reps = parseInt(mostCommonReps);
      }
    }

    await createOrUpdateExercisePattern(session.userId, exerciseName.trim(), processedExerciseData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking exercise pattern:', error);
    return NextResponse.json(
      { error: 'Failed to track exercise pattern' },
      { status: 500 }
    );
  }
}