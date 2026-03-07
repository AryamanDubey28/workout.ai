import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase, upsertDailyHealthMetrics } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const session = await getSessionFromCookie();
        if (!session) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { date, steps, activeCalories, restingHeartRate, sleepHours, vo2Max } = body;

        if (!date) {
            return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
        }

        await initDatabase();

        const result = await upsertDailyHealthMetrics(session.userId, date, {
            steps,
            activeCalories,
            restingHeartRate,
            sleepHours,
            vo2Max,
        });

        if (!result) {
            return NextResponse.json({ error: 'Failed to save health metrics' }, { status: 500 });
        }

        return NextResponse.json({ success: true, metrics: result });
    } catch (error) {
        console.error('Error syncing health metrics:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
