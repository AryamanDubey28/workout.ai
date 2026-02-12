import { sql } from '@vercel/postgres';
import { User, CreateUserData } from '@/types/user';
import { Workout, WorkoutPreset, SplitReminder, Exercise } from '@/types/workout';
import { Meal, MealCategory, Macros, MacroGoal } from '@/types/meal';
import bcrypt from 'bcryptjs';

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function calculateAgeFromDateOfBirth(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

function mapUserRow(row: any): User {
  const dateOfBirth =
    typeof row?.date_of_birth === 'string'
      ? parseDateOnly(row.date_of_birth)
      : null;

  const fallbackAge = Number(row?.age);
  const age = dateOfBirth
    ? calculateAgeFromDateOfBirth(dateOfBirth)
    : Number.isFinite(fallbackAge)
      ? fallbackAge
      : 0;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    age,
    dateOfBirth: dateOfBirth ? toDateOnlyString(dateOfBirth) : undefined,
    weight: Number(row.weight),
    password: row.password,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

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
        date_of_birth DATE,
        weight DECIMAL(5,2) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS date_of_birth DATE;
    `;

    // Backfill legacy users with an approximate DOB so age can auto-update over time.
    await sql`
      UPDATE users
      SET date_of_birth = (CURRENT_DATE - (age::text || ' years')::interval)::date
      WHERE date_of_birth IS NULL;
    `;

    // Create workouts table
    await sql`
      CREATE TABLE IF NOT EXISTS workouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        note TEXT,
        date TIMESTAMP NOT NULL,
        exercises JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Add newly introduced columns for existing databases
    await sql`
      ALTER TABLE workouts
      ADD COLUMN IF NOT EXISTS note TEXT;
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

    // Create meals table
    await sql`
      CREATE TABLE IF NOT EXISTS meals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description VARCHAR(500) NOT NULL,
        calories INTEGER NOT NULL DEFAULT 0,
        protein DECIMAL(6,1) NOT NULL DEFAULT 0,
        carbs DECIMAL(6,1) NOT NULL DEFAULT 0,
        fat DECIMAL(6,1) NOT NULL DEFAULT 0,
        image_url TEXT,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS meals_user_id_idx ON meals(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS meals_user_date_idx ON meals(user_id, date DESC);
    `;

    // Add meal_category column (migration for existing tables)
    await sql`
      ALTER TABLE meals ADD COLUMN IF NOT EXISTS meal_category VARCHAR(20) NOT NULL DEFAULT 'snack';
    `;

    // Create macro_goals table
    await sql`
      CREATE TABLE IF NOT EXISTS macro_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        goal_type VARCHAR(20) NOT NULL DEFAULT 'maintenance',
        calories INTEGER NOT NULL DEFAULT 2000,
        protein DECIMAL(6,1) NOT NULL DEFAULT 150,
        carbs DECIMAL(6,1) NOT NULL DEFAULT 200,
        fat DECIMAL(6,1) NOT NULL DEFAULT 65,
        height_cm DECIMAL(5,1),
        activity_level VARCHAR(20),
        sex VARCHAR(10),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create workout_presets table
    await sql`
      CREATE TABLE IF NOT EXISTS workout_presets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        exercises JSONB NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS workout_presets_user_id_idx ON workout_presets(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS workout_presets_sort_order_idx ON workout_presets(user_id, sort_order);
    `;

    // Create chat_conversations table
    await sql`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS chat_conversations_user_idx ON chat_conversations(user_id, updated_at DESC);
    `;

    // Create chat_messages table
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Add conversation_id column (migration for existing tables)
    await sql`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE;
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS chat_messages_conv_idx ON chat_messages(conversation_id, created_at ASC);
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
    const parsedDob = parseDateOnly(userData.dateOfBirth);

    if (!parsedDob) {
      throw new Error('Invalid date of birth format');
    }

    const computedAge = calculateAgeFromDateOfBirth(parsedDob);
    
    const result = await sql`
      INSERT INTO users (name, email, age, date_of_birth, weight, password)
      VALUES (${userData.name}, ${userData.email}, ${computedAge}, ${toDateOnlyString(parsedDob)}, ${userData.weight}, ${hashedPassword})
      RETURNING id, name, email, age, date_of_birth::text AS date_of_birth, weight, created_at;
    `;
    
    return mapUserRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT id, name, email, age, date_of_birth::text AS date_of_birth, weight, password, created_at
      FROM users
      WHERE email = ${email};
    `;
    
    if (result.rows.length === 0) return null;
    return mapUserRow(result.rows[0]);
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

// Get user by ID (without password)
export async function getUserById(id: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT id, name, email, age, date_of_birth::text AS date_of_birth, weight, created_at
      FROM users
      WHERE id = ${id};
    `;
    
    if (result.rows.length === 0) return null;
    return mapUserRow(result.rows[0]);
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
      INSERT INTO workouts (id, user_id, name, note, date, exercises, created_at, updated_at)
      VALUES (${workout.id}, ${userId}, ${workout.name || null}, ${workout.note || null}, ${workout.date.toISOString()}, ${JSON.stringify(workout.exercises)}, ${workout.createdAt.toISOString()}, ${workout.updatedAt.toISOString()})
      RETURNING id, name, note, date, exercises, created_at, updated_at;
    `;
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      note: row.note || undefined,
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
      SELECT id, name, note, date, exercises, created_at, updated_at
      FROM workouts
      WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC;
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      note: row.note || undefined,
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
    const existingResult = await sql`
      SELECT id, name, note, date, exercises, created_at, updated_at
      FROM workouts
      WHERE id = ${workoutId} AND user_id = ${userId}
      LIMIT 1;
    `;

    if (existingResult.rowCount === 0) {
      return null; // Workout not found or not owned by user
    }

    const existing = existingResult.rows[0];
    const name = workout.name !== undefined ? workout.name : existing.name;
    const note = workout.note !== undefined ? workout.note : existing.note;
    const date = workout.date !== undefined ? workout.date : new Date(existing.date);
    const exercises = workout.exercises !== undefined ? workout.exercises : existing.exercises;
    const updatedAt = workout.updatedAt ? workout.updatedAt.toISOString() : new Date().toISOString();

    const result = await sql`
      UPDATE workouts 
      SET 
        name = ${name || null},
        note = ${note || null},
        date = ${date.toISOString()},
        exercises = ${JSON.stringify(exercises)},
        updated_at = ${updatedAt}
      WHERE id = ${workoutId} AND user_id = ${userId}
      RETURNING id, name, note, date, exercises, created_at, updated_at;
    `;
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      note: row.note || undefined,
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

// ===== WORKOUT PRESET FUNCTIONS =====

function mapPresetRow(row: any): WorkoutPreset {
  return {
    id: row.id,
    name: row.name,
    exercises: row.exercises as Exercise[],
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Create a new workout preset
export async function createWorkoutPreset(
  userId: string,
  preset: { id: string; name: string; exercises: Exercise[]; sortOrder: number }
): Promise<WorkoutPreset | null> {
  try {
    const result = await sql`
      INSERT INTO workout_presets (id, user_id, name, exercises, sort_order, created_at, updated_at)
      VALUES (${preset.id}, ${userId}, ${preset.name}, ${JSON.stringify(preset.exercises)}, ${preset.sortOrder}, NOW(), NOW())
      RETURNING id, name, exercises, sort_order, created_at, updated_at;
    `;
    return mapPresetRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating workout preset:', error);
    return null;
  }
}

// Get all presets for a user ordered by split order
export async function getUserPresets(userId: string): Promise<WorkoutPreset[]> {
  try {
    const result = await sql`
      SELECT id, name, exercises, sort_order, created_at, updated_at
      FROM workout_presets
      WHERE user_id = ${userId}
      ORDER BY sort_order ASC, created_at ASC;
    `;
    return result.rows.map(mapPresetRow);
  } catch (error) {
    console.error('Error getting user presets:', error);
    return [];
  }
}

// Update a workout preset
export async function updateWorkoutPreset(
  userId: string,
  presetId: string,
  updates: Partial<Pick<WorkoutPreset, 'name' | 'exercises' | 'sortOrder'>>
): Promise<WorkoutPreset | null> {
  try {
    const existingResult = await sql`
      SELECT id, name, exercises, sort_order, created_at, updated_at
      FROM workout_presets
      WHERE id = ${presetId} AND user_id = ${userId}
      LIMIT 1;
    `;

    if (existingResult.rowCount === 0) return null;

    const existing = existingResult.rows[0];
    const name = updates.name !== undefined ? updates.name : existing.name;
    const exercises = updates.exercises !== undefined ? updates.exercises : existing.exercises;
    const sortOrder = updates.sortOrder !== undefined ? updates.sortOrder : existing.sort_order;

    const result = await sql`
      UPDATE workout_presets
      SET name = ${name}, exercises = ${JSON.stringify(exercises)}, sort_order = ${sortOrder}, updated_at = NOW()
      WHERE id = ${presetId} AND user_id = ${userId}
      RETURNING id, name, exercises, sort_order, created_at, updated_at;
    `;
    return mapPresetRow(result.rows[0]);
  } catch (error) {
    console.error('Error updating workout preset:', error);
    return null;
  }
}

// Delete a workout preset
export async function deleteWorkoutPreset(userId: string, presetId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM workout_presets
      WHERE id = ${presetId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting workout preset:', error);
    return false;
  }
}

// Reorder presets (updates sort_order based on array index)
export async function reorderWorkoutPresets(userId: string, presetIds: string[]): Promise<boolean> {
  try {
    for (let i = 0; i < presetIds.length; i++) {
      await sql`
        UPDATE workout_presets
        SET sort_order = ${i}, updated_at = NOW()
        WHERE id = ${presetIds[i]} AND user_id = ${userId};
      `;
    }
    return true;
  } catch (error) {
    console.error('Error reordering workout presets:', error);
    return false;
  }
}

// Get the next preset in the split cycle based on most recent matching workout
export async function getNextSplitPreset(userId: string): Promise<SplitReminder> {
  try {
    // Get all presets in order
    const presets = await getUserPresets(userId);
    if (presets.length === 0) {
      return { nextPreset: null, completedToday: false };
    }

    // Find the most recent workout whose name matches any preset (via subquery)
    const lastMatchResult = await sql`
      SELECT w.name, w.date
      FROM workouts w
      WHERE w.user_id = ${userId}
        AND LOWER(w.name) IN (
          SELECT LOWER(wp.name) FROM workout_presets wp WHERE wp.user_id = ${userId}
        )
      ORDER BY w.date DESC, w.created_at DESC
      LIMIT 1;
    `;

    if (lastMatchResult.rows.length === 0) {
      // No matching workouts yet — suggest the first preset
      return { nextPreset: presets[0], completedToday: false };
    }

    const lastWorkout = lastMatchResult.rows[0];
    const lastWorkoutDate = new Date(lastWorkout.date);

    // Check if the last matching workout was today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const completedToday = lastWorkoutDate >= todayStart;

    // Find which preset was last completed
    const matchIndex = presets.findIndex(
      p => p.name.toLowerCase() === lastWorkout.name.toLowerCase()
    );

    if (matchIndex === -1) {
      return { nextPreset: presets[0], completedToday: false };
    }

    // Next preset in rotation
    const nextIndex = (matchIndex + 1) % presets.length;

    if (completedToday) {
      // Already completed today's workout — show next one but mark as done
      return { nextPreset: presets[nextIndex], completedToday: true };
    }

    return { nextPreset: presets[nextIndex], completedToday: false };
  } catch (error) {
    console.error('Error getting next split preset:', error);
    return { nextPreset: null, completedToday: false };
  }
}

// ===== MEAL FUNCTIONS =====

// Create a new meal
export async function createMeal(
  userId: string,
  meal: { id: string; description: string; macros: Macros; category: MealCategory; imageUrl?: string; date: string }
): Promise<Meal | null> {
  try {
    const result = await sql`
      INSERT INTO meals (id, user_id, description, calories, protein, carbs, fat, meal_category, image_url, date)
      VALUES (
        ${meal.id}, ${userId}, ${meal.description},
        ${meal.macros.calories}, ${meal.macros.protein}, ${meal.macros.carbs}, ${meal.macros.fat},
        ${meal.category}, ${meal.imageUrl || null}, ${meal.date}
      )
      RETURNING id, description, calories, protein, carbs, fat, meal_category, image_url, date, created_at;
    `;

    const row = result.rows[0];
    return {
      id: row.id,
      description: row.description,
      macros: {
        calories: Number(row.calories),
        protein: Number(row.protein),
        carbs: Number(row.carbs),
        fat: Number(row.fat),
      },
      category: row.meal_category,
      imageUrl: row.image_url,
      createdAt: new Date(row.created_at),
    };
  } catch (error) {
    console.error('Error creating meal:', error);
    return null;
  }
}

// Get meals for a user on a specific date
export async function getUserMealsByDate(userId: string, date: string): Promise<Meal[]> {
  try {
    const result = await sql`
      SELECT id, description, calories, protein, carbs, fat, meal_category, image_url, created_at
      FROM meals
      WHERE user_id = ${userId} AND date = ${date}
      ORDER BY
        CASE meal_category
          WHEN 'breakfast' THEN 1
          WHEN 'lunch' THEN 2
          WHEN 'snack' THEN 3
          WHEN 'dinner' THEN 4
          ELSE 5
        END,
        created_at ASC;
    `;

    return result.rows.map(row => ({
      id: row.id,
      description: row.description,
      macros: {
        calories: Number(row.calories),
        protein: Number(row.protein),
        carbs: Number(row.carbs),
        fat: Number(row.fat),
      },
      category: row.meal_category || 'snack',
      imageUrl: row.image_url,
      createdAt: new Date(row.created_at),
    }));
  } catch (error) {
    console.error('Error getting meals by date:', error);
    return [];
  }
}

// Delete a meal
export async function deleteMeal(userId: string, mealId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM meals
      WHERE id = ${mealId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting meal:', error);
    return false;
  }
}

// ===== MACRO GOAL FUNCTIONS =====

// Get user's macro goal
export async function getMacroGoal(userId: string): Promise<MacroGoal | null> {
  try {
    const result = await sql`
      SELECT goal_type, calories, protein, carbs, fat, height_cm, activity_level, sex
      FROM macro_goals
      WHERE user_id = ${userId};
    `;

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      goalType: row.goal_type,
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      heightCm: row.height_cm ? Number(row.height_cm) : undefined,
      activityLevel: row.activity_level || undefined,
      sex: row.sex || undefined,
    };
  } catch (error) {
    console.error('Error getting macro goal:', error);
    return null;
  }
}

// Upsert user's macro goal
export async function upsertMacroGoal(userId: string, goal: MacroGoal): Promise<MacroGoal | null> {
  try {
    const result = await sql`
      INSERT INTO macro_goals (user_id, goal_type, calories, protein, carbs, fat, height_cm, activity_level, sex, updated_at)
      VALUES (
        ${userId}, ${goal.goalType}, ${goal.calories}, ${goal.protein}, ${goal.carbs}, ${goal.fat},
        ${goal.heightCm || null}, ${goal.activityLevel || null}, ${goal.sex || null}, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        goal_type = ${goal.goalType},
        calories = ${goal.calories},
        protein = ${goal.protein},
        carbs = ${goal.carbs},
        fat = ${goal.fat},
        height_cm = ${goal.heightCm || null},
        activity_level = ${goal.activityLevel || null},
        sex = ${goal.sex || null},
        updated_at = NOW()
      RETURNING goal_type, calories, protein, carbs, fat, height_cm, activity_level, sex;
    `;

    const row = result.rows[0];
    return {
      goalType: row.goal_type,
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      heightCm: row.height_cm ? Number(row.height_cm) : undefined,
      activityLevel: row.activity_level || undefined,
      sex: row.sex || undefined,
    };
  } catch (error) {
    console.error('Error upserting macro goal:', error);
    return null;
  }
}

// ===== CHAT CONVERSATION FUNCTIONS =====

export interface ChatConversation {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

// Get all conversations for a user
export async function getConversations(userId: string): Promise<ChatConversation[]> {
  try {
    const result = await sql`
      SELECT id, title, created_at, updated_at
      FROM chat_conversations
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC;
    `;
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }));
  } catch (error) {
    console.error('Error getting conversations:', error);
    return [];
  }
}

// Create a new conversation
export async function createConversation(userId: string, title: string = 'New Chat'): Promise<ChatConversation | null> {
  try {
    const result = await sql`
      INSERT INTO chat_conversations (user_id, title)
      VALUES (${userId}, ${title})
      RETURNING id, title, created_at, updated_at;
    `;
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  } catch (error) {
    console.error('Error creating conversation:', error);
    return null;
  }
}

// Delete a conversation (cascades to messages)
export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM chat_conversations
      WHERE id = ${conversationId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return false;
  }
}

// Update conversation title
export async function updateConversationTitle(userId: string, conversationId: string, title: string): Promise<boolean> {
  try {
    await sql`
      UPDATE chat_conversations
      SET title = ${title}, updated_at = NOW()
      WHERE id = ${conversationId} AND user_id = ${userId};
    `;
    return true;
  } catch (error) {
    console.error('Error updating conversation title:', error);
    return false;
  }
}

// Touch conversation updated_at
export async function touchConversation(conversationId: string): Promise<void> {
  try {
    await sql`
      UPDATE chat_conversations SET updated_at = NOW() WHERE id = ${conversationId};
    `;
  } catch (error) {
    console.error('Error touching conversation:', error);
  }
}

// ===== CHAT MESSAGE FUNCTIONS =====

// Get chat messages for a conversation
export async function getChatMessages(conversationId: string, limit: number = 100): Promise<Array<{ id: string; role: string; content: string; created_at: Date }>> {
  try {
    const result = await sql`
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit};
    `;
    return result.rows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: new Date(row.created_at),
    }));
  } catch (error) {
    console.error('Error getting chat messages:', error);
    return [];
  }
}

// Save a chat message
export async function saveChatMessage(userId: string, conversationId: string, role: string, content: string): Promise<{ id: string; role: string; content: string; created_at: Date } | null> {
  try {
    const result = await sql`
      INSERT INTO chat_messages (user_id, conversation_id, role, content)
      VALUES (${userId}, ${conversationId}, ${role}, ${content})
      RETURNING id, role, content, created_at;
    `;
    const row = result.rows[0];
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: new Date(row.created_at),
    };
  } catch (error) {
    console.error('Error saving chat message:', error);
    return null;
  }
}

// Clear all chat messages for a conversation
export async function clearChatMessages(conversationId: string): Promise<boolean> {
  try {
    await sql`
      DELETE FROM chat_messages WHERE conversation_id = ${conversationId};
    `;
    return true;
  } catch (error) {
    console.error('Error clearing chat messages:', error);
    return false;
  }
}
