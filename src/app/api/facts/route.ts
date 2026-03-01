import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getUserFacts, createUserFact } from '@/lib/db';
import { runPersonalityAgentBatch } from '@/lib/agents/personalityAgent';
import { FactCategory } from '@/types/user';

const VALID_CATEGORIES: FactCategory[] = ['health', 'diet', 'goals', 'preferences', 'lifestyle', 'personality', 'training', 'adherence'];

// GET /api/facts - Get all facts for the authenticated user
export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const facts = await getUserFacts(session.userId);

    // Fire-and-forget: batch analyze recent conversations as catch-up
    runPersonalityAgentBatch(session.userId).catch((err) =>
      console.error('Personality agent batch error:', err)
    );

    return NextResponse.json({ facts });
  } catch (error) {
    console.error('Error getting user facts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/facts - Add a user fact manually
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { category, content } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Valid category is required' }, { status: 400 });
    }

    await initDatabase();

    const fact = await createUserFact(session.userId, {
      category,
      content: content.trim(),
      source: 'user_added',
    });

    if (!fact) {
      return NextResponse.json({ error: 'Failed to create fact' }, { status: 500 });
    }

    return NextResponse.json({ fact });
  } catch (error) {
    console.error('Error creating user fact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
