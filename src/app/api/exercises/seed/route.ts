import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase } from '@/lib/db';
import { sql } from '@vercel/postgres';

// Clean, normalized exercise list extracted from your workout data
const cleanExercises = [
  // Core/Abs
  { name: "Kamalu Candlesticks", category: "abs" },
  { name: "Paused Kamalu Candlesticks", category: "abs" },
  { name: "Paused Slow Kamalu Candlesticks", category: "abs" },
  { name: "Bosu Situps", category: "abs" },
  { name: "Banded Woodchoppers", category: "abs" },

  // Back/Pulling
  { name: "Weighted Chinups", category: "back" },
  { name: "Weighted Paused Chinups", category: "back" },
  { name: "Weighted Neutral Pullups", category: "back" },
  { name: "Barbell Rows", category: "back" },
  { name: "Strict Barbell Rows", category: "back" },
  { name: "Strict High Barbell Rows", category: "back" },
  { name: "BB Rows", category: "back" },
  { name: "BB Rows Strict", category: "back" },
  { name: "Ring Rows", category: "back" },
  { name: "Banded Rows", category: "back" },
  { name: "BB High Pull", category: "back" },

  // Biceps
  { name: "Strict Barbell Curls", category: "biceps" },
  { name: "Strict Barbell Curl", category: "biceps" },
  { name: "Lip Buster Rope Curls", category: "biceps" },
  { name: "Lip Buster Rope Curl", category: "biceps" },
  { name: "Low Rope Curl", category: "biceps" },
  { name: "Banded Stretch Curls", category: "biceps" },
  { name: "Stretch Curl", category: "biceps" },

  // Chest/Pushing
  { name: "Weighted Dips", category: "chest" },
  { name: "Weighted Paused Dips", category: "chest" },
  { name: "Weighted Dip", category: "chest" },
  { name: "Dips", category: "chest" },
  { name: "Decline Ring Pushups", category: "chest" },
  { name: "Decline Ring Flys", category: "chest" },
  { name: "Ring Flys", category: "chest" },
  { name: "Prisoner Pump Pushups", category: "chest" },

  // Shoulders
  { name: "DB Laterals", category: "shoulders" },
  { name: "Banded Laterals", category: "shoulders" },
  { name: "Lateral Band Raises", category: "shoulders" },
  { name: "Lateral Raises", category: "shoulders" },
  { name: "Single Arm Lateral Band Raises", category: "shoulders" },
  { name: "Lu Raises", category: "shoulders" },

  // Triceps
  { name: "Banded Tricep Pushdowns", category: "triceps" },

  // Legs
  { name: "Heel Elevated Squats", category: "legs" },

  // Compound/Other
  { name: "Upper Gym Workout", category: "other" },
];

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize all database tables first
    await initDatabase();

    let inserted = 0;
    let skipped = 0;

    // Insert exercises
    for (const exercise of cleanExercises) {
      try {
        await sql`
          INSERT INTO common_exercises (name, category, aliases)
          VALUES (${exercise.name}, ${exercise.category}, ${JSON.stringify([exercise.name])})
          ON CONFLICT (name) DO NOTHING;
        `;
        
        const result = await sql`SELECT COUNT(*) as count FROM common_exercises WHERE name = ${exercise.name}`;
        if (result.rows[0].count > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error inserting ${exercise.name}:`, error);
        skipped++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Seeded ${inserted} exercises, skipped ${skipped} duplicates`,
      total: cleanExercises.length
    });
  } catch (error) {
    console.error('Error seeding exercises:', error);
    return NextResponse.json(
      { error: 'Failed to seed exercises' },
      { status: 500 }
    );
  }
}