import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, getUserById, getUserUsageSummary, getAllUsageSummary, getUserByEmail } from '@/lib/db';

export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'arrydube2823@gmail.com';

// GET /api/usage — Admin-only usage summary
// ?period=week|month|all (default: month)
// ?email=user@example.com (optional: filter to specific user)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    // Owner-only gate
    const user = await getUserById(session.userId);
    if (!user || user.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const emailFilter = searchParams.get('email');

    const now = new Date();
    let startDate: string;
    if (period === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString();
    } else if (period === 'all') {
      startDate = '2020-01-01T00:00:00.000Z';
    } else {
      // month (default)
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = monthAgo.toISOString();
    }
    const endDate = now.toISOString();

    // Filter by specific user email
    if (emailFilter) {
      const targetUser = await getUserByEmail(emailFilter);
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const features = await getUserUsageSummary(targetUser.id, startDate, endDate);
      const totalCost = features.reduce((sum, f) => sum + f.totalCost, 0);
      return NextResponse.json({
        user: {
          name: targetUser.name,
          email: targetUser.email,
          totalCost: Math.round(totalCost * 1000000) / 1000000,
          byFeature: Object.fromEntries(features.map(f => [f.feature, { calls: f.calls, cost: Math.round(f.totalCost * 1000000) / 1000000 }])),
        },
        period: { start: startDate, end: endDate },
      });
    }

    // All users summary
    const users = await getAllUsageSummary(startDate, endDate);
    const totalCost = users.reduce((sum, u) => sum + u.totalCost, 0);

    return NextResponse.json({
      users: users.map(u => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        totalCost: Math.round(u.totalCost * 1000000) / 1000000,
        byFeature: Object.fromEntries(u.features.map(f => [f.feature, { calls: f.calls, cost: Math.round(f.totalCost * 1000000) / 1000000 }])),
      })),
      totalCost: Math.round(totalCost * 1000000) / 1000000,
      period: { start: startDate, end: endDate },
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
