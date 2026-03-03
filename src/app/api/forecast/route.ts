import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  initDatabase,
  getWorkoutForecast,
  upsertForecastOverride,
  deleteForecastOverride,
  cleanupPastForecastOverrides,
} from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    await cleanupPastForecastOverrides(session.userId);

    const forecast = await getWorkoutForecast(session.userId);
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error('Error getting forecast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const body = await request.json();
    const { date, presetId } = body;

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    // Validate date is today or future
    const forecastDate = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (forecastDate < today) {
      return NextResponse.json({ error: 'Cannot set forecast for past dates' }, { status: 400 });
    }

    const success = await upsertForecastOverride(session.userId, date, presetId ?? null);
    if (!success) {
      return NextResponse.json({ error: 'Failed to save forecast override' }, { status: 500 });
    }

    const forecast = await getWorkoutForecast(session.userId);
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error('Error saving forecast override:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
    }

    await deleteForecastOverride(session.userId, date);

    const forecast = await getWorkoutForecast(session.userId);
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error('Error deleting forecast override:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
