import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotifications(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  const validMessages = messages.filter(
    (m) => typeof m.to === 'string' && Expo.isExpoPushToken(m.to),
  );

  if (validMessages.length === 0) return [];

  const chunks = expo.chunkPushNotifications(validMessages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notification chunk:', error);
    }
  }

  return tickets;
}

export function buildInactivityNudge(
  token: string,
  days: number,
): ExpoPushMessage {
  return {
    to: token,
    sound: 'default',
    title: 'Missing you at the gym!',
    body: `It's been ${days} days since your last workout. Ready to get back to it?`,
    data: { screen: 'Workouts', type: 'inactivity_nudge' },
  };
}

export function buildWeeklySummary(
  token: string,
  stats: { workouts: number; meals: number; avgCalories: number },
): ExpoPushMessage {
  return {
    to: token,
    sound: 'default',
    title: 'Your Weekly Summary',
    body: `This week: ${stats.workouts} workout${stats.workouts !== 1 ? 's' : ''}, ${stats.meals} meal${stats.meals !== 1 ? 's' : ''} logged (avg ${stats.avgCalories} cal/day)`,
    data: { screen: 'Health', type: 'weekly_summary' },
  };
}
