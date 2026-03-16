import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getRecommendationsForPreset } from '@/lib/db';

// GET /api/recommendations?presetName=X
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const presetName = searchParams.get('presetName');

    if (!presetName) {
      return NextResponse.json(
        { error: 'presetName query parameter is required' },
        { status: 400 }
      );
    }

    await initDatabase();

    const recommendations = await getRecommendationsForPreset(session.userId, presetName);

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
