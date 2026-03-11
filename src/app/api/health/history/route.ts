import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getDailyHealthMetrics, getWorkoutMinutesByDate } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate query params are required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    await initDatabase();

    const [metrics, workoutMinutes] = await Promise.all([
      getDailyHealthMetrics(session.userId, startDate, endDate),
      getWorkoutMinutesByDate(session.userId, startDate, endDate),
    ]);

    const enrichedMetrics = metrics.map((m) => ({
      date: m.date,
      steps: m.steps ?? null,
      activeCalories: m.activeCalories ?? null,
      restingHeartRate: m.restingHeartRate ?? null,
      sleepHours: m.sleepHours ?? null,
      weight: m.weight ?? null,
      workoutMinutes: workoutMinutes[m.date] ?? 0,
    }));

    return NextResponse.json({ metrics: enrichedMetrics });
  } catch (error) {
    console.error('Error fetching health history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
