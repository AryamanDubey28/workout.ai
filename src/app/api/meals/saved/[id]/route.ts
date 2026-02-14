import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, deleteSavedMeal, updateSavedMeal } from '@/lib/db';

export async function PUT(
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

    const savedMeal = await updateSavedMeal(session.userId, id, {
      name: name.trim(),
      description,
      macros,
    });

    if (!savedMeal) {
      return NextResponse.json({ error: 'Saved meal not found' }, { status: 404 });
    }

    return NextResponse.json({ savedMeal });
  } catch (error) {
    console.error('Error updating saved meal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const { id } = await params;
    const deleted = await deleteSavedMeal(session.userId, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Saved meal not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Saved meal deleted' });
  } catch (error) {
    console.error('Error deleting saved meal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
