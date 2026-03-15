import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getWeeklySummaryCandidates } from '@/lib/db';
import {
  sendPushNotifications,
  buildWeeklySummary,
} from '@/lib/pushNotifications';
import type { ExpoPushMessage } from 'expo-server-sdk';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDatabase();

    // Single query: fetches all opted-in users with their stats in one go
    const candidates = await getWeeklySummaryCandidates();
    const messages: ExpoPushMessage[] = [];

    for (const user of candidates) {
      for (const token of user.tokens) {
        messages.push(
          buildWeeklySummary(token, {
            workouts: user.workouts,
            meals: user.meals,
            avgCalories: user.avgCalories,
          }),
        );
      }
    }

    const tickets = await sendPushNotifications(messages);

    return NextResponse.json({
      sent: messages.length,
      tickets: tickets.length,
    });
  } catch (error) {
    console.error('Error in weekly summary cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
