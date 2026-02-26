import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getUserWorkouts, initDatabase } from '@/lib/db';
import { Workout, Exercise } from '@/types/workout';

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatPace(distanceKm: number, durationSeconds: number): string {
  if (distanceKm <= 0) return '';
  const paceSeconds = durationSeconds / distanceKm;
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.round(paceSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function workoutsToCSV(workouts: Workout[]): string {
  const headers = [
    'Date',
    'Workout Name',
    'Type',
    'Exercise',
    'Set',
    'Weight (lbs)',
    'Reps',
    'Effective Reps Target',
    'Effective Reps Max',
    'Distance (km)',
    'Duration',
    'Pace',
    'Notes',
  ];

  const rows: string[][] = [];

  for (const workout of workouts) {
    const date = new Date(workout.date).toLocaleDateString('en-US');
    const name = workout.name || '';
    const type = workout.type || 'strength';
    const note = workout.note || '';

    // Add run data row if applicable
    if (workout.type === 'run' && workout.runData) {
      const { distanceKm, durationSeconds } = workout.runData;
      rows.push([
        date,
        name,
        type,
        'Run',
        '',
        '',
        '',
        '',
        '',
        distanceKm.toFixed(2),
        formatDuration(durationSeconds),
        formatPace(distanceKm, durationSeconds),
        note,
      ]);
    }

    // Add exercise rows
    for (const exercise of workout.exercises) {
      const sets = exercise.sets || exercise.weightsPerSet?.length || exercise.repsPerSet?.length || 1;

      for (let s = 0; s < sets; s++) {
        const weight = exercise.weightsPerSet?.[s] ?? exercise.weight ?? '';
        const reps = exercise.repsPerSet?.[s] ?? exercise.reps ?? '';

        rows.push([
          date,
          name,
          type,
          exercise.name,
          String(s + 1),
          String(weight),
          String(reps),
          exercise.useEffectiveReps ? String(exercise.effectiveRepsTarget ?? '') : '',
          exercise.useEffectiveReps ? String(exercise.effectiveRepsMax ?? '') : '',
          '',
          '',
          '',
          s === 0 ? note : '',
        ]);
      }
    }

    // If no exercises and not a run, still add a row
    if (workout.exercises.length === 0 && workout.type !== 'run') {
      rows.push([date, name, type, '', '', '', '', '', '', '', '', '', note]);
    }
  }

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvLines.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await initDatabase();

    const range = request.nextUrl.searchParams.get('range') || 'all';
    const allWorkouts = await getUserWorkouts(session.userId);

    let filtered: Workout[];
    if (range === '30') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      filtered = allWorkouts.filter((w) => new Date(w.date) >= cutoff);
    } else if (range === '60') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      filtered = allWorkouts.filter((w) => new Date(w.date) >= cutoff);
    } else {
      filtered = allWorkouts;
    }

    const csv = workoutsToCSV(filtered);
    const filename = `workouts-${range === 'all' ? 'all' : `last-${range}-days`}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting workouts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
