import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getAiSoul, deleteAiSoul } from '@/lib/db';
import { runSoulBuilder, SOUL_PRESETS } from '@/lib/agents/soulBuilderAgent';

// GET /api/soul - Get the user's AI personality
export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const soul = await getAiSoul(session.userId);
    return NextResponse.json({ soul });
  } catch (error) {
    console.error('Error getting AI soul:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/soul - Create or update the user's AI personality
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { presetId, customInput } = body;

    if (!presetId && (!customInput || typeof customInput !== 'string' || !customInput.trim())) {
      return NextResponse.json(
        { error: 'Either presetId or customInput is required' },
        { status: 400 }
      );
    }

    if (presetId && !SOUL_PRESETS.find((p) => p.id === presetId)) {
      return NextResponse.json({ error: 'Invalid preset ID' }, { status: 400 });
    }

    await initDatabase();

    const result = await runSoulBuilder(session.userId, {
      presetId: presetId || undefined,
      customInput: customInput?.trim() || undefined,
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to generate personality' }, { status: 500 });
    }

    // Fetch the saved soul to return full object
    const soul = await getAiSoul(session.userId);
    return NextResponse.json({ soul });
  } catch (error) {
    console.error('Error setting AI soul:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/soul - Remove the user's AI personality
export async function DELETE() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    await deleteAiSoul(session.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting AI soul:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
