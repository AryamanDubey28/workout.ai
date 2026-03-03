import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getPendingFoodSuggestions, deleteAllFoodSuggestions } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    const suggestions = await getPendingFoodSuggestions(session.userId);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error getting food suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/meals/suggestions - Delete all suggestions for the authenticated user
export async function DELETE() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();
    await deleteAllFoodSuggestions(session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting all food suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
