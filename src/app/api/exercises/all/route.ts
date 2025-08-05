import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's personal exercise patterns
    const userPatternsResult = await sql`
      SELECT 
        canonical_name,
        variations,
        last_weight,
        last_sets,
        last_reps,
        last_effective_reps_max,
        last_effective_reps_target,
        use_effective_reps,
        usage_count,
        updated_at
      FROM exercise_patterns
      WHERE user_id = ${session.userId}
      ORDER BY usage_count DESC, updated_at DESC;
    `;

    // Get common exercises
    const commonExercisesResult = await sql`
      SELECT 
        name as canonical_name,
        aliases as variations,
        category
      FROM common_exercises
      ORDER BY name;
    `;

    // Format user patterns
    const userExercises = userPatternsResult.rows.map(row => ({
      name: row.canonical_name,
      variations: Array.isArray(row.variations) ? row.variations : [row.canonical_name],
      lastWeight: row.last_weight,
      lastSets: row.last_sets,
      lastReps: row.last_reps,
      lastEffectiveRepsMax: row.last_effective_reps_max,
      lastEffectiveRepsTarget: row.last_effective_reps_target,
      useEffectiveReps: row.use_effective_reps,
      usageCount: row.usage_count,
      updatedAt: row.updated_at,
      source: 'user'
    }));

    // Format common exercises (excluding ones user already has patterns for)
    const userExerciseNames = new Set(userExercises.flatMap(ex => 
      ex.variations.map(v => v.toLowerCase())
    ));

    const commonExercises = commonExercisesResult.rows
      .filter(row => !userExerciseNames.has(row.canonical_name.toLowerCase()))
      .map(row => ({
        name: row.canonical_name,
        variations: Array.isArray(row.variations) ? row.variations : [row.canonical_name],
        category: row.category,
        lastWeight: null,
        lastSets: null,
        lastReps: null,
        lastEffectiveRepsMax: null,
        lastEffectiveRepsTarget: null,
        useEffectiveReps: false,
        usageCount: 0,
        updatedAt: null,
        source: 'common'
      }));

    // Combine and return all exercises
    const allExercises = [...userExercises, ...commonExercises];
    
    return NextResponse.json({ 
      exercises: allExercises,
      lastUpdated: new Date().toISOString(),
      count: allExercises.length
    });
  } catch (error) {
    console.error('Error getting all exercises:', error);
    return NextResponse.json(
      { error: 'Failed to get exercises' },
      { status: 500 }
    );
  }
}