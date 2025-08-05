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

    await createOrUpdateExercisePattern(session.userId, exerciseName.trim(), exerciseData || {});
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking exercise pattern:', error);
    return NextResponse.json(
      { error: 'Failed to track exercise pattern' },
      { status: 500 }
    );
  }
}