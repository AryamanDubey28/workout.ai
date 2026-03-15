import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  initDatabase,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    const row = await getNotificationPreferences(session.userId);

    const preferences = row
      ? {
          inactivityNudge: row.inactivity_nudge,
          inactivityDays: row.inactivity_days,
          weeklySummary: row.weekly_summary,
        }
      : { inactivityNudge: false, inactivityDays: 3, weeklySummary: false };

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { inactivityNudge, inactivityDays, weeklySummary } =
      await request.json();

    await initDatabase();
    const row = await upsertNotificationPreferences(session.userId, {
      inactivityNudge: Boolean(inactivityNudge),
      inactivityDays: Number(inactivityDays) || 3,
      weeklySummary: Boolean(weeklySummary),
    });

    return NextResponse.json({
      preferences: {
        inactivityNudge: row.inactivity_nudge,
        inactivityDays: row.inactivity_days,
        weeklySummary: row.weekly_summary,
      },
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
