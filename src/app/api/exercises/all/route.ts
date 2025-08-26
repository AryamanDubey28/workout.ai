import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize database tables if they don't exist
    const { initDatabase } = await import('@/lib/db');
    await initDatabase();

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
    let commonExercisesResult;
    try {
      commonExercisesResult = await sql`
        SELECT 
          name as canonical_name,
          aliases as variations,
          category
        FROM common_exercises
        ORDER BY name;
      `;
    } catch (error) {
      console.warn('Common exercises table not found or empty, using fallback:', error);
      commonExercisesResult = { rows: [] };
    }

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

    let commonExercises = [];
    
    if (commonExercisesResult.rows.length > 0) {
      // Use seeded exercises if available
      commonExercises = commonExercisesResult.rows
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
    } else {
      // Fallback to basic exercises if database is not seeded
      const fallbackExercises = [
        { name: 'Push-ups', category: 'chest', aliases: ['Push-ups', 'Pushups'] },
        { name: 'Squats', category: 'legs', aliases: ['Squats', 'Bodyweight Squats'] },
        { name: 'Pull-ups', category: 'back', aliases: ['Pull-ups', 'Pullups'] },
        { name: 'Plank', category: 'core', aliases: ['Plank', 'Planks'] },
        { name: 'Bench Press', category: 'chest', aliases: ['Bench Press', 'BP'] },
        { name: 'Deadlift', category: 'compound', aliases: ['Deadlift', 'DL'] },
        { name: 'Overhead Press', category: 'shoulders', aliases: ['Overhead Press', 'OHP'] },
        { name: 'Barbell Rows', category: 'back', aliases: ['Barbell Rows', 'Bent Over Rows'] }
      ];
      
      commonExercises = fallbackExercises
        .filter(ex => !userExerciseNames.has(ex.name.toLowerCase()))
        .map(ex => ({
          name: ex.name,
          variations: ex.aliases,
          category: ex.category,
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
    }

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