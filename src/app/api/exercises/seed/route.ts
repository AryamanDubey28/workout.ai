import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { initDatabase } from '@/lib/db';
import { sql } from '@vercel/postgres';

interface ExerciseData {
  name: string;
  category: string;
  aliases?: string[];
}

// Comprehensive exercise list with common gym exercises + your specialized ones
const cleanExercises: ExerciseData[] = [
  // COMPOUND MOVEMENTS (Most Important!)
  { name: "Deadlift", category: "compound", aliases: ["Deadlift", "Conventional Deadlift", "DL"] },
  { name: "Squat", category: "compound", aliases: ["Squat", "Back Squat", "Barbell Squat"] },
  { name: "Bench Press", category: "compound", aliases: ["Bench Press", "Barbell Bench Press", "BP"] },
  { name: "Overhead Press", category: "compound", aliases: ["Overhead Press", "Military Press", "OHP", "Standing Press"] },

  // CHEST
  { name: "Push-ups", category: "chest", aliases: ["Push-ups", "Pushups", "Push Up"] },
  { name: "Incline Bench Press", category: "chest", aliases: ["Incline Bench Press", "Incline BP"] },
  { name: "Decline Bench Press", category: "chest", aliases: ["Decline Bench Press", "Decline BP"] },
  { name: "Dumbbell Bench Press", category: "chest", aliases: ["Dumbbell Bench Press", "DB Bench Press", "DB BP"] },
  { name: "Incline Dumbbell Press", category: "chest", aliases: ["Incline Dumbbell Press", "Incline DB Press"] },
  { name: "Chest Flys", category: "chest", aliases: ["Chest Flys", "Dumbbell Flys", "DB Flys"] },
  { name: "Cable Flys", category: "chest", aliases: ["Cable Flys", "Cable Crossover"] },
  { name: "Pec Deck", category: "chest", aliases: ["Pec Deck", "Pec Fly Machine"] },
  { name: "Dips", category: "chest", aliases: ["Dips", "Parallel Bar Dips"] },
  { name: "Weighted Dips", category: "chest", aliases: ["Weighted Dips"] },
  { name: "Weighted Paused Dips", category: "chest", aliases: ["Weighted Paused Dips"] },
  { name: "Decline Ring Pushups", category: "chest", aliases: ["Decline Ring Pushups"] },
  { name: "Ring Flys", category: "chest", aliases: ["Ring Flys"] },
  { name: "Close-Grip Bench Press", category: "chest", aliases: ["Close-Grip Bench Press", "CGBP"] },

  // BACK
  { name: "Pull-ups", category: "back", aliases: ["Pull-ups", "Pullups", "Pull Up"] },
  { name: "Chin-ups", category: "back", aliases: ["Chin-ups", "Chinups", "Chin Up"] },
  { name: "Lat Pulldown", category: "back", aliases: ["Lat Pulldown", "Lat Pulldowns", "Wide Grip Pulldown"] },
  { name: "Seated Cable Row", category: "back", aliases: ["Seated Cable Row", "Cable Row", "Seated Row"] },
  { name: "T-Bar Row", category: "back", aliases: ["T-Bar Row", "T-Bar Rows"] },
  { name: "One-Arm Dumbbell Row", category: "back", aliases: ["One-Arm Dumbbell Row", "Single Arm DB Row"] },
  { name: "Face Pulls", category: "back", aliases: ["Face Pulls", "Cable Face Pulls"] },
  { name: "Sumo Deadlift", category: "back", aliases: ["Sumo Deadlift", "Sumo DL"] },
  { name: "Romanian Deadlift", category: "back", aliases: ["Romanian Deadlift", "RDL", "Romanian DL"] },
  { name: "Barbell Rows", category: "back", aliases: ["Barbell Rows", "Bent Over Row"] },
  { name: "Weighted Chinups", category: "back", aliases: ["Weighted Chinups"] },
  { name: "Weighted Pullups", category: "back", aliases: ["Weighted Pullups", "Weighted Pull-ups"] },
  { name: "Ring Rows", category: "back", aliases: ["Ring Rows"] },

  // SHOULDERS
  { name: "Shoulder Press", category: "shoulders", aliases: ["Shoulder Press", "Dumbbell Shoulder Press", "DB Press"] },
  { name: "Lateral Raises", category: "shoulders", aliases: ["Lateral Raises", "Side Raises", "DB Laterals"] },
  { name: "Front Raises", category: "shoulders", aliases: ["Front Raises", "Front Delt Raises"] },
  { name: "Rear Delt Flys", category: "shoulders", aliases: ["Rear Delt Flys", "Reverse Flys", "Rear Flys"] },
  { name: "Upright Rows", category: "shoulders", aliases: ["Upright Rows", "Upright Row"] },
  { name: "Arnold Press", category: "shoulders", aliases: ["Arnold Press", "Arnold Presses"] },
  { name: "Pike Push-ups", category: "shoulders", aliases: ["Pike Push-ups", "Pike Pushups"] },
  { name: "Handstand Push-ups", category: "shoulders", aliases: ["Handstand Push-ups", "HSPU"] },
  { name: "Lu Raises", category: "shoulders", aliases: ["Lu Raises"] },

  // LEGS
  { name: "Front Squat", category: "legs", aliases: ["Front Squat", "Front Squats"] },
  { name: "Goblet Squat", category: "legs", aliases: ["Goblet Squat", "Goblet Squats"] },
  { name: "Bulgarian Split Squat", category: "legs", aliases: ["Bulgarian Split Squat", "BSS"] },
  { name: "Lunges", category: "legs", aliases: ["Lunges", "Walking Lunges", "Reverse Lunges"] },
  { name: "Leg Press", category: "legs", aliases: ["Leg Press", "45-Degree Leg Press"] },
  { name: "Leg Curls", category: "legs", aliases: ["Leg Curls", "Hamstring Curls", "Lying Leg Curls"] },
  { name: "Leg Extensions", category: "legs", aliases: ["Leg Extensions", "Quad Extensions"] },
  { name: "Calf Raises", category: "legs", aliases: ["Calf Raises", "Standing Calf Raises"] },
  { name: "Seated Calf Raises", category: "legs", aliases: ["Seated Calf Raises"] },
  { name: "Stiff Leg Deadlift", category: "legs", aliases: ["Stiff Leg Deadlift", "SLDL"] },
  { name: "Good Mornings", category: "legs", aliases: ["Good Mornings", "Good Morning"] },
  { name: "Hip Thrusts", category: "legs", aliases: ["Hip Thrusts", "Glute Bridge"] },
  { name: "Step-ups", category: "legs", aliases: ["Step-ups", "Box Step-ups"] },
  { name: "Heel Elevated Squats", category: "legs", aliases: ["Heel Elevated Squats"] },

  // BICEPS
  { name: "Barbell Curls", category: "biceps", aliases: ["Barbell Curls", "BB Curls", "Standing Barbell Curls"] },
  { name: "Dumbbell Curls", category: "biceps", aliases: ["Dumbbell Curls", "DB Curls", "Alternating DB Curls"] },
  { name: "Hammer Curls", category: "biceps", aliases: ["Hammer Curls", "Neutral Grip Curls"] },
  { name: "Preacher Curls", category: "biceps", aliases: ["Preacher Curls", "Preacher Bench Curls"] },
  { name: "Concentration Curls", category: "biceps", aliases: ["Concentration Curls"] },
  { name: "Cable Curls", category: "biceps", aliases: ["Cable Curls", "Cable Bicep Curls"] },
  { name: "21s", category: "biceps", aliases: ["21s", "Twenty-Ones"] },
  { name: "Strict Barbell Curls", category: "biceps", aliases: ["Strict Barbell Curls"] },
  { name: "Rope Curls", category: "biceps", aliases: ["Rope Curls", "Cable Rope Curls"] },

  // TRICEPS
  { name: "Tricep Dips", category: "triceps", aliases: ["Tricep Dips", "Bench Dips"] },
  { name: "Tricep Pushdowns", category: "triceps", aliases: ["Tricep Pushdowns", "Cable Pushdowns"] },
  { name: "Overhead Tricep Extension", category: "triceps", aliases: ["Overhead Tricep Extension", "Skull Crushers"] },
  { name: "French Press", category: "triceps", aliases: ["French Press", "Lying Tricep Extension"] },
  { name: "Diamond Push-ups", category: "triceps", aliases: ["Diamond Push-ups", "Triangle Push-ups"] },
  { name: "Tricep Kickbacks", category: "triceps", aliases: ["Tricep Kickbacks", "DB Kickbacks"] },
  { name: "Rope Tricep Extension", category: "triceps", aliases: ["Rope Tricep Extension", "Rope Pushdowns"] },

  // CORE/ABS
  { name: "Plank", category: "abs", aliases: ["Plank", "Front Plank", "Forearm Plank"] },
  { name: "Side Plank", category: "abs", aliases: ["Side Plank", "Lateral Plank"] },
  { name: "Crunches", category: "abs", aliases: ["Crunches", "Abdominal Crunches"] },
  { name: "Sit-ups", category: "abs", aliases: ["Sit-ups", "Situps"] },
  { name: "Russian Twists", category: "abs", aliases: ["Russian Twists", "Russian Twist"] },
  { name: "Leg Raises", category: "abs", aliases: ["Leg Raises", "Lying Leg Raises"] },
  { name: "Hanging Leg Raises", category: "abs", aliases: ["Hanging Leg Raises", "HLR"] },
  { name: "Mountain Climbers", category: "abs", aliases: ["Mountain Climbers"] },
  { name: "Dead Bug", category: "abs", aliases: ["Dead Bug", "Dead Bugs"] },
  { name: "Bicycle Crunches", category: "abs", aliases: ["Bicycle Crunches", "Bicycle Crunch"] },
  { name: "Ab Wheel Rollout", category: "abs", aliases: ["Ab Wheel Rollout", "Ab Wheel"] },
  { name: "Kamalu Candlesticks", category: "abs", aliases: ["Kamalu Candlesticks"] },
  { name: "Paused Kamalu Candlesticks", category: "abs", aliases: ["Paused Kamalu Candlesticks"] },
  { name: "Paused Slow Kamalu Candlesticks", category: "abs", aliases: ["Paused Slow Kamalu Candlesticks"] },
  { name: "Woodchoppers", category: "abs", aliases: ["Woodchoppers", "Cable Woodchoppers"] },

  // CARDIO/CONDITIONING
  { name: "Burpees", category: "cardio", aliases: ["Burpees", "Burpee"] },
  { name: "Jump Squats", category: "cardio", aliases: ["Jump Squats", "Squat Jumps"] },
  { name: "Box Jumps", category: "cardio", aliases: ["Box Jumps", "Box Jump"] },
  { name: "High Knees", category: "cardio", aliases: ["High Knees"] },
  { name: "Jumping Jacks", category: "cardio", aliases: ["Jumping Jacks", "Star Jumps"] },
  { name: "Battle Ropes", category: "cardio", aliases: ["Battle Ropes", "Training Ropes"] },

  // FUNCTIONAL/OTHER
  { name: "Farmers Walk", category: "other", aliases: ["Farmers Walk", "Farmer's Walk"] },
  { name: "Turkish Get-up", category: "other", aliases: ["Turkish Get-up", "TGU"] },
  { name: "Kettlebell Swings", category: "other", aliases: ["Kettlebell Swings", "KB Swings"] },
  { name: "Wall Sit", category: "other", aliases: ["Wall Sit", "Wall Sits"] },
  { name: "Bear Crawl", category: "other", aliases: ["Bear Crawl", "Bear Crawls"] },
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
        // Use aliases from exercise if available, otherwise use name as default alias
        const aliases = exercise.aliases || [exercise.name];
        
        await sql`
          INSERT INTO common_exercises (name, category, aliases)
          VALUES (${exercise.name}, ${exercise.category}, ${JSON.stringify(aliases)})
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