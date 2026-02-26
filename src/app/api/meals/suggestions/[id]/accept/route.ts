import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, updateFoodSuggestionStatus, createSavedMeal } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    const { id } = await params;
    const body = await request.json();
    const { name, description, macros } = body;

    if (!name?.trim() || !description || !macros) {
      return NextResponse.json(
        { error: 'Missing required fields: name, description, macros' },
        { status: 400 }
      );
    }

    // Create saved meal in food bank
    const savedMeal = await createSavedMeal(session.userId, {
      id: crypto.randomUUID(),
      name: name.trim(),
      description,
      macros,
    });

    if (!savedMeal) {
      return NextResponse.json({ error: 'Failed to create saved meal' }, { status: 500 });
    }

    // Mark suggestion as accepted
    await updateFoodSuggestionStatus(session.userId, id, 'accepted');

    return NextResponse.json({ savedMeal });
  } catch (error) {
    console.error('Error accepting food suggestion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
