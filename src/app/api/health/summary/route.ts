import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getHealthSummary } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';

    if (!['week', 'month', '3months'].includes(period)) {
      return NextResponse.json(
        { error: 'period must be one of: week, month, 3months' },
        { status: 400 }
      );
    }

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];

    let startDate: string;
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      startDate = d.toISOString().split('T')[0];
    } else {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    }

    await initDatabase();

    const summary = await getHealthSummary(session.userId, startDate, endDate);

    return NextResponse.json({
      summary,
      period,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('Error fetching health summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
