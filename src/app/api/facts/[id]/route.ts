import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, deleteUserFact } from '@/lib/db';

// DELETE /api/facts/:id - Delete a specific fact
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Fact ID is required' }, { status: 400 });
    }

    await initDatabase();

    const deleted = await deleteUserFact(session.userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Fact not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user fact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
