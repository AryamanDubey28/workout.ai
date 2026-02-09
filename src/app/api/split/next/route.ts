import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getNextSplitPreset, initDatabase } from '@/lib/db';

// GET /api/split/next - Get the next workout in the split cycle
export async function GET() {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await initDatabase();

    const reminder = await getNextSplitPreset(session.userId);

    return NextResponse.json(reminder);
  } catch (error) {
    console.error('Error getting next split:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
