import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { logUsage } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/usage/voice — Ingest voice session usage from mobile client
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      model = 'gpt-realtime-1.5',
      inputTokens = 0,
      outputTokens = 0,
      cachedTokens = 0,
      audioInputTokens = 0,
      audioOutputTokens = 0,
    } = body;

    // Fire-and-forget logging — respond immediately
    logUsage(session.userId, 'voice_session', model, {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      cachedTokens,
      audioInputTokens,
      audioOutputTokens,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error logging voice usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
