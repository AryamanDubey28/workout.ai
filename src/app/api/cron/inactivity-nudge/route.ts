import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getInactivityNudgeCandidates } from '@/lib/db';
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

    // Single query: returns only users who are past their inactivity threshold
    const candidates = await getInactivityNudgeCandidates();
    const messages: ExpoPushMessage[] = [];

    for (const user of candidates) {
      for (const token of user.tokens) {
        messages.push(buildInactivityNudge(token, user.daysSinceLastWorkout));
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
