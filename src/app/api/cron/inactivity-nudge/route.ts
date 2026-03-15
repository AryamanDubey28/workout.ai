import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  getUsersWithInactivityNudgeEnabled,
  getLastWorkoutDate,
} from '@/lib/db';
import {
  sendPushNotifications,
  buildInactivityNudge,
} from '@/lib/pushNotifications';
import type { ExpoPushMessage } from 'expo-server-sdk';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDatabase();

    const users = await getUsersWithInactivityNudgeEnabled();
    const messages: ExpoPushMessage[] = [];

    for (const user of users) {
      const lastWorkoutDate = await getLastWorkoutDate(user.userId);
      if (!lastWorkoutDate) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(lastWorkoutDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysSince >= user.inactivityDays) {
        for (const token of user.tokens) {
          messages.push(buildInactivityNudge(token, daysSince));
        }
      }
    }

    const tickets = await sendPushNotifications(messages);

    return NextResponse.json({
      sent: messages.length,
      tickets: tickets.length,
    });
  } catch (error) {
    console.error('Error in inactivity nudge cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
