import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, upsertDeviceToken, removeDeviceToken } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { token, platform } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    await initDatabase();
    await upsertDeviceToken(session.userId, token, platform || 'ios');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering device token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    await initDatabase();
    await removeDeviceToken(session.userId, token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing device token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
