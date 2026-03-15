import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  getUsersWithWeeklySummaryEnabled,
  getWeeklyStats,
} from '@/lib/db';
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

    const users = await getUsersWithWeeklySummaryEnabled();
    const messages: ExpoPushMessage[] = [];

    for (const user of users) {
      const stats = await getWeeklyStats(user.userId);
      for (const token of user.tokens) {
        messages.push(buildWeeklySummary(token, stats));
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
