import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  initDatabase,
  getWorkoutForecast,
  swapForecastDays,
} from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const body = await request.json();
    const { date1, date2 } = body;

    if (!date1 || !date2) {
      return NextResponse.json({ error: 'date1 and date2 are required' }, { status: 400 });
    }

    if (date1 === date2) {
      return NextResponse.json({ error: 'Cannot swap a day with itself' }, { status: 400 });
    }

    // Validate both dates are today or future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const date of [date1, date2]) {
      const d = new Date(date + 'T00:00:00');
      if (d < today) {
        return NextResponse.json({ error: 'Cannot swap past dates' }, { status: 400 });
      }
    }

    // Get current forecast to know what's on each day
    const currentForecast = await getWorkoutForecast(session.userId);
    const day1 = currentForecast.find(f => f.date === date1);
    const day2 = currentForecast.find(f => f.date === date2);

    if (!day1 || !day2) {
      return NextResponse.json({ error: 'One or both dates are outside the forecast range' }, { status: 400 });
    }

    const success = await swapForecastDays(
      session.userId,
      date1,
      date2,
      { id: day1.presetId },
      { id: day2.presetId },
    );

    if (!success) {
      return NextResponse.json({ error: 'Failed to swap forecast days' }, { status: 500 });
    }

    const forecast = await getWorkoutForecast(session.userId);
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error('Error swapping forecast days:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
