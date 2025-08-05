import { sql } from '@vercel/postgres';
import { User, CreateUserData } from '@/types/user';
import { Workout } from '@/types/workout';
import bcrypt from 'bcryptjs';

// Initialize the database tables
export async function initDatabase() {
  try {
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INTEGER NOT NULL,
        weight DECIMAL(5,2) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create workouts table
    await sql`
      CREATE TABLE IF NOT EXISTS workouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        date TIMESTAMP NOT NULL,
        exercises JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create index on user_id for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS workouts_user_id_idx ON workouts(user_id);
    `;

    // Create exercise_patterns table for autocomplete
    await sql`
      CREATE TABLE IF NOT EXISTS exercise_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        canonical_name VARCHAR(255) NOT NULL,
        variations JSONB NOT NULL DEFAULT '[]',
        last_weight VARCHAR(50),
        last_sets INTEGER,
        last_reps INTEGER,
        last_effective_reps_max INTEGER,
        last_effective_reps_target INTEGER,
        use_effective_reps BOOLEAN DEFAULT FALSE,
        usage_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create indexes for exercise patterns
    await sql`
      CREATE INDEX IF NOT EXISTS exercise_patterns_user_id_idx ON exercise_patterns(user_id);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS exercise_patterns_canonical_name_idx ON exercise_patterns(canonical_name);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS exercise_patterns_usage_count_idx ON exercise_patterns(usage_count DESC);
    `;

    // Create common_exercises table for seed data
    await sql`
      CREATE TABLE IF NOT EXISTS common_exercises (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        category VARCHAR(100),
        aliases JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS common_exercises_name_idx ON common_exercises(name);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS common_exercises_category_idx ON common_exercises(category);
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Create a new user
export async function createUser(userData: CreateUserData): Promise<User | null> {
  try {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const result = await sql`
      INSERT INTO users (name, email, age, weight, password)
      VALUES (${userData.name}, ${userData.email}, ${userData.age}, ${userData.weight}, ${hashedPassword})
      RETURNING id, name, email, age, weight, created_at;
    `;
    
    return result.rows[0] as User;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT id, name, email, age, weight, password, created_at
      FROM users
      WHERE email = ${email};
    `;
    
    return result.rows[0] as User || null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

// Get user by ID (without password)
export async function getUserById(id: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT id, name, email, age, weight, created_at
      FROM users
      WHERE id = ${id};
    `;
    
    return result.rows[0] as User || null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}

// Verify user credentials
export async function verifyUser(email: string, password: string): Promise<User | null> {
  try {
    console.log('DB: Looking up user by email:', email);
    const user = await getUserByEmail(email);
    
    if (!user) {
      console.log('DB: User not found for email:', email);
      return null;
    }
    
    if (!user.password) {
      console.log('DB: User found but no password hash for email:', email);
      return null;
    }
    
    console.log('DB: User found, verifying password for email:', email);
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log('DB: Invalid password for email:', email);
      return null;
    }
    
    console.log('DB: Password verification successful for email:', email);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  } catch (error) {
    console.error('Error verifying user:', error);
    return null;
  }
}

// Check if email already exists
export async function emailExists(email: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM users WHERE email = ${email};
    `;
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking email existence:', error);
    return false;
  }
}

// ===== EXERCISE PATTERN FUNCTIONS =====

// Create or update exercise pattern
export async function createOrUpdateExercisePattern(
  userId: string, 
  exerciseName: string, 
  exerciseData: {
    weight?: string;
    sets?: number;
    reps?: number;
    useEffectiveReps?: boolean;
    effectiveRepsMax?: number;
    effectiveRepsTarget?: number;
  }
): Promise<void> {
  try {
    // First, try to find existing pattern
    const existing = await sql`
      SELECT id, variations, usage_count
      FROM exercise_patterns
      WHERE user_id = ${userId} 
      AND (
        canonical_name ILIKE ${exerciseName} 
        OR variations::text ILIKE ${`%"${exerciseName}"%`}
      )
      LIMIT 1;
    `;

    if (existing.rows.length > 0) {
      // Update existing pattern
      const pattern = existing.rows[0];
      const variations = Array.isArray(pattern.variations) ? pattern.variations : [];
      
      // Add new variation if not already present
      if (!variations.some((v: string) => v.toLowerCase() === exerciseName.toLowerCase())) {
        variations.push(exerciseName);
      }

      await sql`
        UPDATE exercise_patterns
        SET 
          last_weight = ${exerciseData.weight || null},
          last_sets = ${exerciseData.sets || null},
          last_reps = ${exerciseData.reps || null},
          last_effective_reps_max = ${exerciseData.effectiveRepsMax || null},
          last_effective_reps_target = ${exerciseData.effectiveRepsTarget || null},
          use_effective_reps = ${exerciseData.useEffectiveReps || false},
          variations = ${JSON.stringify(variations)},
          usage_count = ${pattern.usage_count + 1},
          updated_at = NOW()
        WHERE id = ${pattern.id};
      `;
    } else {
      // Create new pattern
      await sql`
        INSERT INTO exercise_patterns (
          user_id, canonical_name, variations, last_weight, last_sets, last_reps,
          last_effective_reps_max, last_effective_reps_target, use_effective_reps,
          usage_count, created_at, updated_at
        )
        VALUES (
          ${userId}, ${exerciseName}, ${JSON.stringify([exerciseName])},
          ${exerciseData.weight || null}, ${exerciseData.sets || null}, ${exerciseData.reps || null},
          ${exerciseData.effectiveRepsMax || null}, ${exerciseData.effectiveRepsTarget || null},
          ${exerciseData.useEffectiveReps || false}, 1, NOW(), NOW()
        );
      `;
    }
  } catch (error) {
    console.error('Error creating/updating exercise pattern:', error);
  }
}

// Get exercise suggestions for autocomplete
export async function getExerciseSuggestions(userId: string, query: string, limit: number = 5): Promise<Array<{
  name: string;
  lastWeight?: string;
  lastSets?: number;
  lastReps?: number;
  lastEffectiveRepsMax?: number;
  lastEffectiveRepsTarget?: number;
  useEffectiveReps?: boolean;
  usageCount: number;
}>> {
  try {
    if (!query || query.length < 1) return [];

    // First get user's personal exercise patterns
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
        'user' as source
      FROM exercise_patterns
      WHERE user_id = ${userId}
      AND (
        canonical_name ILIKE ${`%${query}%`}
        OR variations::text ILIKE ${`%${query}%`}
      )
      ORDER BY usage_count DESC, updated_at DESC;
    `;

    // Then get common exercises if we need more suggestions
    const commonExercisesResult = await sql`
      SELECT 
        name as canonical_name,
        aliases as variations,
        null as last_weight,
        null as last_sets,
        null as last_reps,
        null as last_effective_reps_max,
        null as last_effective_reps_target,
        false as use_effective_reps,
        0 as usage_count,
        'common' as source
      FROM common_exercises
      WHERE name ILIKE ${`%${query}%`}
      OR aliases::text ILIKE ${`%${query}%`}
      ORDER BY name;
    `;

    // Combine results, prioritizing user patterns
    const userSuggestions = userPatternsResult.rows.map(row => {
      const variations = Array.isArray(row.variations) ? row.variations : [row.canonical_name];
      const queryLower = query.toLowerCase();
      
      // Find the best matching variation
      let bestMatch = row.canonical_name;
      for (const variation of variations) {
        if (variation.toLowerCase() === queryLower) {
          bestMatch = variation;
          break;
        } else if (variation.toLowerCase().startsWith(queryLower)) {
          bestMatch = variation;
        } else if (bestMatch === row.canonical_name && variation.toLowerCase().includes(queryLower)) {
          bestMatch = variation;
        }
      }

      return {
        name: bestMatch,
        lastWeight: row.last_weight,
        lastSets: row.last_sets,
        lastReps: row.last_reps,
        lastEffectiveRepsMax: row.last_effective_reps_max,
        lastEffectiveRepsTarget: row.last_effective_reps_target,
        useEffectiveReps: row.use_effective_reps,
        usageCount: row.usage_count,
      };
    });

    // Add common exercises if we have space and they're not already in user patterns
    const userExerciseNames = new Set(userSuggestions.map(s => s.name.toLowerCase()));
    const commonSuggestions = commonExercisesResult.rows
      .filter(row => !userExerciseNames.has(row.canonical_name.toLowerCase()))
      .map(row => ({
        name: row.canonical_name,
        lastWeight: undefined,
        lastSets: undefined,
        lastReps: undefined,
        lastEffectiveRepsMax: undefined,
        lastEffectiveRepsTarget: undefined,
        useEffectiveReps: false,
        usageCount: 0,
      }));

    // Combine and limit results
    const allSuggestions = [...userSuggestions, ...commonSuggestions];
    return allSuggestions.slice(0, limit);
  } catch (error) {
    console.error('Error getting exercise suggestions:', error);
    return [];
  }
}

// Get all unique exercise names for a user
export async function getUserExerciseNames(userId: string): Promise<string[]> {
  try {
    const result = await sql`
      SELECT DISTINCT canonical_name, variations
      FROM exercise_patterns
      WHERE user_id = ${userId}
      ORDER BY canonical_name;
    `;

    const names = new Set<string>();
    result.rows.forEach(row => {
      names.add(row.canonical_name);
      if (Array.isArray(row.variations)) {
        row.variations.forEach((variation: string) => names.add(variation));
      }
    });

    return Array.from(names).sort();
  } catch (error) {
    console.error('Error getting user exercise names:', error);
    return [];
  }
}

// ===== WORKOUT FUNCTIONS =====

// Create a new workout
export async function createWorkout(userId: string, workout: Workout): Promise<Workout | null> {
  try {
    const result = await sql`
      INSERT INTO workouts (id, user_id, name, date, exercises, created_at, updated_at)
      VALUES (${workout.id}, ${userId}, ${workout.name || null}, ${workout.date.toISOString()}, ${JSON.stringify(workout.exercises)}, ${workout.createdAt.toISOString()}, ${workout.updatedAt.toISOString()})
      RETURNING id, name, date, exercises, created_at, updated_at;
    `;
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      date: new Date(row.date),
      exercises: row.exercises,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as Workout;
  } catch (error) {
    console.error('Error creating workout:', error);
    return null;
  }
}

// Get all workouts for a user
export async function getUserWorkouts(userId: string): Promise<Workout[]> {
  try {
    const result = await sql`
      SELECT id, name, date, exercises, created_at, updated_at
      FROM workouts
      WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC;
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      date: new Date(row.date),
      exercises: row.exercises,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    })) as Workout[];
  } catch (error) {
    console.error('Error getting user workouts:', error);
    return [];
  }
}

// Update an existing workout
export async function updateWorkout(userId: string, workoutId: string, workout: Partial<Workout>): Promise<Workout | null> {
  try {
    const result = await sql`
      UPDATE workouts 
      SET 
        name = ${workout.name || null},
        date = ${workout.date ? workout.date.toISOString() : null},
        exercises = ${workout.exercises ? JSON.stringify(workout.exercises) : null},
        updated_at = ${workout.updatedAt ? workout.updatedAt.toISOString() : new Date().toISOString()}
      WHERE id = ${workoutId} AND user_id = ${userId}
      RETURNING id, name, date, exercises, created_at, updated_at;
    `;
    
    if (result.rowCount === 0) {
      return null; // Workout not found or not owned by user
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      date: new Date(row.date),
      exercises: row.exercises,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as Workout;
  } catch (error) {
    console.error('Error updating workout:', error);
    return null;
  }
}

// Delete a workout
export async function deleteWorkout(userId: string, workoutId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM workouts
      WHERE id = ${workoutId} AND user_id = ${userId};
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting workout:', error);
    return false;
  }
}