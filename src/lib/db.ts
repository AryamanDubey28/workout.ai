import { sql } from '@vercel/postgres';
import { User, CreateUserData, UserFact, FactCategory, FactSource, AiSoul } from '@/types/user';
import { Workout, WorkoutPreset, SplitReminder, ForecastDay, Exercise, WorkoutType, RunData } from '@/types/workout';
import { Meal, MealCategory, Macros, MacroGoal, SavedMeal, FoodSuggestion, SuggestionStatus } from '@/types/meal';
import { DailyHealthMetrics } from '@/types/health';
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

    await sql`
      ALTER TABLE workouts
      ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'strength';
    `;

    await sql`
      ALTER TABLE workouts
      ADD COLUMN IF NOT EXISTS run_data JSONB;
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

    // Add sort_order column for meal reordering
    await sql`
      ALTER TABLE meals ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
    `;

    // Create saved_meals table (food bank)
    await sql`
      CREATE TABLE IF NOT EXISTS saved_meals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description VARCHAR(500) NOT NULL,
        calories INTEGER NOT NULL DEFAULT 0,
        protein DECIMAL(6,1) NOT NULL DEFAULT 0,
        carbs DECIMAL(6,1) NOT NULL DEFAULT 0,
        fat DECIMAL(6,1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS saved_meals_user_id_idx ON saved_meals(user_id);
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
      ALTER TABLE workout_presets ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'strength';
    `;

    await sql`
      ALTER TABLE workout_presets ADD COLUMN IF NOT EXISTS run_data JSONB;
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS workout_presets_user_id_idx ON workout_presets(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS workout_presets_sort_order_idx ON workout_presets(user_id, sort_order);
    `;

    // Create workout_forecast_overrides table
    await sql`
      CREATE TABLE IF NOT EXISTS workout_forecast_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        forecast_date DATE NOT NULL,
        preset_id UUID REFERENCES workout_presets(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, forecast_date)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS forecast_overrides_user_date_idx ON workout_forecast_overrides(user_id, forecast_date);
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

    // Create food_suggestions table
    await sql`
      CREATE TABLE IF NOT EXISTS food_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description VARCHAR(500) NOT NULL,
        calories INTEGER NOT NULL DEFAULT 0,
        protein DECIMAL(6,1) NOT NULL DEFAULT 0,
        carbs DECIMAL(6,1) NOT NULL DEFAULT 0,
        fat DECIMAL(6,1) NOT NULL DEFAULT 0,
        frequency INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS food_suggestions_user_status_idx ON food_suggestions(user_id, status);
    `;

    // Create user_facts table
    await sql`
      CREATE TABLE IF NOT EXISTS user_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL DEFAULT 'personality',
        content TEXT NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'ai_extracted',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS user_facts_user_id_idx ON user_facts(user_id);
    `;

    // Create ai_souls table
    await sql`
      CREATE TABLE IF NOT EXISTS ai_souls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        preset_id VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        soul_content TEXT NOT NULL,
        user_input TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create daily_health_metrics table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_health_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        steps INTEGER,
        active_calories INTEGER,
        resting_heart_rate INTEGER,
        sleep_hours DECIMAL(4,1),
        vo2_max DECIMAL(4,1),
        weight DECIMAL(5,2),
        distance DECIMAL(6,2),
        exercise_minutes INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, date)
      );
    `;

    // Add columns if missing (migration for existing databases)
    await sql`ALTER TABLE daily_health_metrics ADD COLUMN IF NOT EXISTS weight DECIMAL(5,2);`;
    await sql`ALTER TABLE daily_health_metrics ADD COLUMN IF NOT EXISTS distance DECIMAL(6,2);`;
    await sql`ALTER TABLE daily_health_metrics ADD COLUMN IF NOT EXISTS exercise_minutes INTEGER;`;

    // Device tokens for push notifications
    await sql`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform VARCHAR(10) NOT NULL DEFAULT 'ios',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, token)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);`;

    // Notification preferences (server-triggered only)
    await sql`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        inactivity_nudge BOOLEAN NOT NULL DEFAULT false,
        inactivity_days INTEGER NOT NULL DEFAULT 3,
        weekly_summary BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Add type column to chat_conversations (migration for existing databases)
    await sql`ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'text';`;

    // Create exercise_recommendations table for progressive overload
    await sql`
      CREATE TABLE IF NOT EXISTS exercise_recommendations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        preset_name VARCHAR(255) NOT NULL,
        exercise_name VARCHAR(255) NOT NULL,
        exercise_position INTEGER NOT NULL,
        recommended_weight VARCHAR(50),
        recommended_reps INTEGER,
        recommendation_type VARCHAR(30) NOT NULL DEFAULT 'maintain',
        recommendation_text VARCHAR(255),
        confidence VARCHAR(20) DEFAULT 'medium',
        based_on_sessions INTEGER DEFAULT 0,
        stall_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS exercise_recs_user_preset_idx
        ON exercise_recommendations(user_id, preset_name);
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS exercise_recs_unique_idx
        ON exercise_recommendations(user_id, preset_name, exercise_name, exercise_position);
    `;

    // Create progression_params table for AI-tuned per-exercise parameters
    await sql`
      CREATE TABLE IF NOT EXISTS progression_params (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_name VARCHAR(255) NOT NULL,
        exercise_category VARCHAR(30) DEFAULT 'unknown',
        weight_increment DECIMAL(6,2),
        weight_increment_pct DECIMAL(5,2),
        stall_threshold INTEGER DEFAULT 3,
        deload_pct DECIMAL(5,2) DEFAULT 10.0,
        min_increment DECIMAL(6,2) DEFAULT 2.5,
        max_increment DECIMAL(6,2) DEFAULT 10.0,
        success_rate DECIMAL(5,2),
        last_analyzed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS progression_params_unique_idx
        ON progression_params(user_id, exercise_name);
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

// Update user profile fields (weight, dateOfBirth)
export async function updateUser(
  userId: string,
  updates: { weight?: number; dateOfBirth?: string }
): Promise<User | null> {
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.weight !== undefined) {
      setClauses.push(`weight = $${paramIndex++}`);
      values.push(updates.weight);
    }

    if (updates.dateOfBirth !== undefined) {
      const parsed = parseDateOnly(updates.dateOfBirth);
      if (!parsed) return null;
      const age = calculateAgeFromDateOfBirth(parsed);
      setClauses.push(`date_of_birth = $${paramIndex++}`);
      values.push(toDateOnlyString(parsed));
      setClauses.push(`age = $${paramIndex++}`);
      values.push(age);
    }

    if (setClauses.length === 0) return null;

    values.push(userId);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, age, date_of_birth::text AS date_of_birth, weight, created_at`;
    const result = await sql.query(query, values);

    if (result.rows.length === 0) return null;
    return mapUserRow(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
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

function mapWorkoutRow(row: any): Workout {
  return {
    id: row.id,
    name: row.name || undefined,
    note: row.note || undefined,
    date: new Date(row.date),
    type: (row.type as WorkoutType) || 'strength',
    runData: row.run_data || undefined,
    exercises: row.exercises || [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Create a new workout
export async function createWorkout(userId: string, workout: Workout): Promise<Workout | null> {
  try {
    const result = await sql`
      INSERT INTO workouts (id, user_id, name, note, date, type, run_data, exercises, created_at, updated_at)
      VALUES (
        ${workout.id}, ${userId}, ${workout.name || null}, ${workout.note || null},
        ${workout.date.toISOString()},
        ${workout.type || 'strength'},
        ${workout.runData ? JSON.stringify(workout.runData) : null},
        ${JSON.stringify(workout.exercises)},
        ${workout.createdAt.toISOString()}, ${workout.updatedAt.toISOString()}
      )
      RETURNING id, name, note, date, type, run_data, exercises, created_at, updated_at;
    `;

    return mapWorkoutRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating workout:', error);
    return null;
  }
}

// Get all workouts for a user
export async function getUserWorkout(userId: string, workoutId: string): Promise<Workout | null> {
  try {
    const result = await sql`
      SELECT id, name, note, date, type, run_data, exercises, created_at, updated_at
      FROM workouts
      WHERE id = ${workoutId} AND user_id = ${userId}
      LIMIT 1;
    `;

    if (result.rowCount === 0) return null;
    return mapWorkoutRow(result.rows[0]);
  } catch (error) {
    console.error('Error getting workout:', error);
    return null;
  }
}

export async function getUserWorkouts(userId: string): Promise<Workout[]> {
  try {
    const result = await sql`
      SELECT id, name, note, date, type, run_data, exercises, created_at, updated_at
      FROM workouts
      WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC;
    `;

    return result.rows.map(mapWorkoutRow);
  } catch (error) {
    console.error('Error getting user workouts:', error);
    return [];
  }
}

// Update an existing workout
export async function updateWorkout(userId: string, workoutId: string, workout: Partial<Workout>): Promise<Workout | null> {
  try {
    const existingResult = await sql`
      SELECT id, name, note, date, type, run_data, exercises, created_at, updated_at
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
    const type = workout.type !== undefined ? workout.type : (existing.type || 'strength');
    const runData = workout.runData !== undefined ? workout.runData : existing.run_data;
    const exercises = workout.exercises !== undefined ? workout.exercises : existing.exercises;
    const updatedAt = workout.updatedAt ? workout.updatedAt.toISOString() : new Date().toISOString();

    const result = await sql`
      UPDATE workouts
      SET
        name = ${name || null},
        note = ${note || null},
        date = ${date.toISOString()},
        type = ${type},
        run_data = ${runData ? JSON.stringify(runData) : null},
        exercises = ${JSON.stringify(exercises)},
        updated_at = ${updatedAt}
      WHERE id = ${workoutId} AND user_id = ${userId}
      RETURNING id, name, note, date, type, run_data, exercises, created_at, updated_at;
    `;

    return mapWorkoutRow(result.rows[0]);
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
    type: (row.type as WorkoutType) || 'strength',
    runData: row.run_data || undefined,
    exercises: row.exercises as Exercise[],
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Create a new workout preset
export async function createWorkoutPreset(
  userId: string,
  preset: { id: string; name: string; type?: WorkoutType; runData?: RunData; exercises: Exercise[]; sortOrder: number }
): Promise<WorkoutPreset | null> {
  try {
    const presetType = preset.type || 'strength';
    const runDataJson = preset.runData ? JSON.stringify(preset.runData) : null;
    const result = await sql`
      INSERT INTO workout_presets (id, user_id, name, type, run_data, exercises, sort_order, created_at, updated_at)
      VALUES (${preset.id}, ${userId}, ${preset.name}, ${presetType}, ${runDataJson}, ${JSON.stringify(preset.exercises)}, ${preset.sortOrder}, NOW(), NOW())
      RETURNING id, name, type, run_data, exercises, sort_order, created_at, updated_at;
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
      SELECT id, name, type, run_data, exercises, sort_order, created_at, updated_at
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
  updates: Partial<Pick<WorkoutPreset, 'name' | 'type' | 'runData' | 'exercises' | 'sortOrder'>>
): Promise<WorkoutPreset | null> {
  try {
    const existingResult = await sql`
      SELECT id, name, type, run_data, exercises, sort_order, created_at, updated_at
      FROM workout_presets
      WHERE id = ${presetId} AND user_id = ${userId}
      LIMIT 1;
    `;

    if (existingResult.rowCount === 0) return null;

    const existing = existingResult.rows[0];
    const name = updates.name !== undefined ? updates.name : existing.name;
    const type = updates.type !== undefined ? updates.type : existing.type;
    const runData = updates.runData !== undefined ? updates.runData : existing.run_data;
    const exercises = updates.exercises !== undefined ? updates.exercises : existing.exercises;
    const sortOrder = updates.sortOrder !== undefined ? updates.sortOrder : existing.sort_order;
    const runDataJson = runData ? JSON.stringify(runData) : null;

    const result = await sql`
      UPDATE workout_presets
      SET name = ${name}, type = ${type}, run_data = ${runDataJson}, exercises = ${JSON.stringify(exercises)}, sort_order = ${sortOrder}, updated_at = NOW()
      WHERE id = ${presetId} AND user_id = ${userId}
      RETURNING id, name, type, run_data, exercises, sort_order, created_at, updated_at;
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

// ===== FORECAST FUNCTIONS =====

export async function getWorkoutForecast(userId: string, days: number = 7): Promise<ForecastDay[]> {
  try {
    const presets = await getUserPresets(userId);
    const today = new Date();

    // If no presets, return all rest days
    if (presets.length === 0) {
      const result: ForecastDay[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        result.push({
          date: toDateOnlyString(d),
          presetId: null,
          presetName: null,
          presetType: null,
          isOverride: false,
        });
      }
      return result;
    }

    // Determine starting cycle index from split rotation
    const splitReminder = await getNextSplitPreset(userId);
    let cycleIndex = 0;
    if (splitReminder.nextPreset) {
      const idx = presets.findIndex(p => p.id === splitReminder.nextPreset!.id);
      if (idx !== -1) cycleIndex = idx;
    }

    // If today's workout is already done, back up the cycle so today
    // shows the completed preset and tomorrow starts with nextPreset
    if (splitReminder.completedToday) {
      cycleIndex = (cycleIndex - 1 + presets.length) % presets.length;
    }

    // Fetch overrides for the date range
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days - 1);
    const todayStr = toDateOnlyString(today);
    const endStr = toDateOnlyString(endDate);

    const overridesResult = await sql`
      SELECT fo.forecast_date, fo.preset_id, wp.name as preset_name, wp.type as preset_type
      FROM workout_forecast_overrides fo
      LEFT JOIN workout_presets wp ON fo.preset_id = wp.id
      WHERE fo.user_id = ${userId}
        AND fo.forecast_date >= ${todayStr}::date
        AND fo.forecast_date <= ${endStr}::date;
    `;

    const overrideMap = new Map<string, { presetId: string | null; presetName: string | null; presetType: string | null }>();
    for (const row of overridesResult.rows) {
      const dateKey = toDateOnlyString(new Date(row.forecast_date));
      overrideMap.set(dateKey, {
        presetId: row.preset_id,
        presetName: row.preset_name,
        presetType: row.preset_type,
      });
    }

    // Build the forecast array
    const forecast: ForecastDay[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = toDateOnlyString(d);

      const override = overrideMap.get(dateStr);
      if (override !== undefined) {
        // User override — does NOT advance the cycle
        forecast.push({
          date: dateStr,
          presetId: override.presetId,
          presetName: override.presetName,
          presetType: (override.presetType as WorkoutType) || null,
          isOverride: true,
        });
      } else {
        // Use the next preset in cycle
        const preset = presets[cycleIndex % presets.length];
        forecast.push({
          date: dateStr,
          presetId: preset.id,
          presetName: preset.name,
          presetType: (preset.type as WorkoutType) || 'strength',
          isOverride: false,
        });
        cycleIndex++;
      }
    }

    return forecast;
  } catch (error) {
    console.error('Error computing workout forecast:', error);
    return [];
  }
}

export async function upsertForecastOverride(
  userId: string,
  date: string,
  presetId: string | null
): Promise<boolean> {
  try {
    await sql`
      INSERT INTO workout_forecast_overrides (user_id, forecast_date, preset_id)
      VALUES (${userId}, ${date}::date, ${presetId})
      ON CONFLICT (user_id, forecast_date)
      DO UPDATE SET preset_id = ${presetId}, updated_at = NOW();
    `;
    return true;
  } catch (error) {
    console.error('Error upserting forecast override:', error);
    return false;
  }
}

export async function deleteForecastOverride(userId: string, date: string): Promise<boolean> {
  try {
    await sql`
      DELETE FROM workout_forecast_overrides
      WHERE user_id = ${userId} AND forecast_date = ${date}::date;
    `;
    return true;
  } catch (error) {
    console.error('Error deleting forecast override:', error);
    return false;
  }
}

export async function cleanupPastForecastOverrides(userId: string): Promise<void> {
  try {
    await sql`
      DELETE FROM workout_forecast_overrides
      WHERE user_id = ${userId}
        AND forecast_date < CURRENT_DATE;
    `;
  } catch (error) {
    console.error('Error cleaning up past forecast overrides:', error);
  }
}

// ===== MEAL FUNCTIONS =====

// Create a new meal
export async function createMeal(
  userId: string,
  meal: { id: string; description: string; macros: Macros; category: MealCategory; imageUrl?: string; date: string; createdAt?: string }
): Promise<Meal | null> {
  try {
    const createdAtValue = meal.createdAt || new Date().toISOString();
    // Auto-assign sort_order: max + 1 for this user/date/category
    const maxResult = await sql`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM meals
      WHERE user_id = ${userId} AND date = ${meal.date} AND meal_category = ${meal.category};
    `;
    const nextOrder = (maxResult.rows[0]?.max_order ?? -1) + 1;

    const result = await sql`
      INSERT INTO meals (id, user_id, description, calories, protein, carbs, fat, meal_category, image_url, date, created_at, sort_order)
      VALUES (
        ${meal.id}, ${userId}, ${meal.description},
        ${meal.macros.calories}, ${meal.macros.protein}, ${meal.macros.carbs}, ${meal.macros.fat},
        ${meal.category}, ${meal.imageUrl || null}, ${meal.date}, ${createdAtValue}, ${nextOrder}
      )
      RETURNING id, description, calories, protein, carbs, fat, meal_category, image_url, date, created_at, sort_order;
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
      sortOrder: row.sort_order,
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
      SELECT id, description, calories, protein, carbs, fat, meal_category, image_url, created_at, sort_order
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
        sort_order ASC,
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
      sortOrder: row.sort_order ?? 0,
    }));
  } catch (error) {
    console.error('Error getting meals by date:', error);
    return [];
  }
}

// Get meals for a user within a date range (inclusive)
export async function getUserMealsForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; meals: Meal[] }[]> {
  try {
    const result = await sql`
      SELECT id, description, calories, protein, carbs, fat, meal_category, image_url, date, created_at, sort_order
      FROM meals
      WHERE user_id = ${userId} AND date >= ${startDate} AND date <= ${endDate}
      ORDER BY date DESC,
        CASE meal_category
          WHEN 'breakfast' THEN 1
          WHEN 'lunch' THEN 2
          WHEN 'snack' THEN 3
          WHEN 'dinner' THEN 4
          ELSE 5
        END,
        sort_order ASC,
        created_at ASC;
    `;

    const byDate = new Map<string, Meal[]>();
    for (const row of result.rows) {
      const dateKey = new Date(row.date).toISOString().split('T')[0];
      const meal: Meal = {
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
        sortOrder: row.sort_order ?? 0,
      };
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(meal);
    }

    return Array.from(byDate.entries()).map(([date, meals]) => ({ date, meals }));
  } catch (error) {
    console.error('Error getting meals for date range:', error);
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

// Update meal time and category
export async function updateMealTime(
  userId: string,
  mealId: string,
  createdAt: string,
  category: MealCategory
): Promise<Meal | null> {
  try {
    const result = await sql`
      UPDATE meals
      SET created_at = ${createdAt}, meal_category = ${category}
      WHERE id = ${mealId} AND user_id = ${userId}
      RETURNING id, description, calories, protein, carbs, fat, meal_category, image_url, date, created_at, sort_order;
    `;

    if (result.rows.length === 0) return null;

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
      sortOrder: row.sort_order ?? 0,
    };
  } catch (error) {
    console.error('Error updating meal time:', error);
    return null;
  }
}

// Reorder meals (batch update sort_order and category)
export async function reorderMeals(
  userId: string,
  updates: { id: string; category: MealCategory; sortOrder: number }[]
): Promise<boolean> {
  try {
    for (const update of updates) {
      await sql`
        UPDATE meals
        SET meal_category = ${update.category}, sort_order = ${update.sortOrder}
        WHERE id = ${update.id} AND user_id = ${userId};
      `;
    }
    return true;
  } catch (error) {
    console.error('Error reordering meals:', error);
    return false;
  }
}

// ===== SAVED MEAL (FOOD BANK) FUNCTIONS =====

function mapSavedMealRow(row: any): SavedMeal {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    macros: {
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    },
    createdAt: new Date(row.created_at),
  };
}

export async function createSavedMeal(
  userId: string,
  meal: { id: string; name: string; description: string; macros: Macros }
): Promise<SavedMeal | null> {
  try {
    const result = await sql`
      INSERT INTO saved_meals (id, user_id, name, description, calories, protein, carbs, fat)
      VALUES (
        ${meal.id}, ${userId}, ${meal.name}, ${meal.description},
        ${meal.macros.calories}, ${meal.macros.protein}, ${meal.macros.carbs}, ${meal.macros.fat}
      )
      RETURNING id, name, description, calories, protein, carbs, fat, created_at;
    `;
    return mapSavedMealRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating saved meal:', error);
    return null;
  }
}

export async function getUserSavedMeals(userId: string): Promise<SavedMeal[]> {
  try {
    const result = await sql`
      SELECT id, name, description, calories, protein, carbs, fat, created_at
      FROM saved_meals
      WHERE user_id = ${userId}
      ORDER BY name ASC;
    `;
    return result.rows.map(mapSavedMealRow);
  } catch (error) {
    console.error('Error getting saved meals:', error);
    return [];
  }
}

export async function deleteSavedMeal(userId: string, mealId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM saved_meals
      WHERE id = ${mealId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting saved meal:', error);
    return false;
  }
}

export async function updateSavedMeal(
  userId: string,
  mealId: string,
  meal: { name: string; description: string; macros: Macros }
): Promise<SavedMeal | null> {
  try {
    const result = await sql`
      UPDATE saved_meals
      SET name = ${meal.name}, description = ${meal.description},
          calories = ${meal.macros.calories}, protein = ${meal.macros.protein},
          carbs = ${meal.macros.carbs}, fat = ${meal.macros.fat}
      WHERE id = ${mealId} AND user_id = ${userId}
      RETURNING id, name, description, calories, protein, carbs, fat, created_at;
    `;
    if (result.rows.length === 0) return null;
    return mapSavedMealRow(result.rows[0]);
  } catch (error) {
    console.error('Error updating saved meal:', error);
    return null;
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
  type: string;
  created_at: Date;
  updated_at: Date;
}

// Get all conversations for a user
export async function getConversations(userId: string): Promise<ChatConversation[]> {
  try {
    const result = await sql`
      SELECT id, title, type, created_at, updated_at
      FROM chat_conversations
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC;
    `;
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      type: row.type || 'text',
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }));
  } catch (error) {
    console.error('Error getting conversations:', error);
    return [];
  }
}

// Create a new conversation
export async function createConversation(userId: string, title: string = 'New Chat', type: string = 'text'): Promise<ChatConversation | null> {
  try {
    const result = await sql`
      INSERT INTO chat_conversations (user_id, title, type)
      VALUES (${userId}, ${title}, ${type})
      RETURNING id, title, type, created_at, updated_at;
    `;
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
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

// ===== FOOD SUGGESTION FUNCTIONS =====

function mapFoodSuggestionRow(row: any): FoodSuggestion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    macros: {
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    },
    frequency: Number(row.frequency),
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

export async function getPendingFoodSuggestions(userId: string): Promise<FoodSuggestion[]> {
  try {
    const result = await sql`
      SELECT id, name, description, calories, protein, carbs, fat, frequency, status, created_at
      FROM food_suggestions
      WHERE user_id = ${userId} AND status = 'pending'
      ORDER BY frequency DESC, created_at DESC;
    `;
    return result.rows.map(mapFoodSuggestionRow);
  } catch (error) {
    console.error('Error getting pending food suggestions:', error);
    return [];
  }
}

export async function getRecentFoodSuggestions(userId: string): Promise<FoodSuggestion[]> {
  try {
    const result = await sql`
      SELECT id, name, description, calories, protein, carbs, fat, frequency, status, created_at
      FROM food_suggestions
      WHERE user_id = ${userId}
        AND status IN ('pending', 'dismissed')
        AND created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC;
    `;
    return result.rows.map(mapFoodSuggestionRow);
  } catch (error) {
    console.error('Error getting recent food suggestions:', error);
    return [];
  }
}

export async function createFoodSuggestion(
  userId: string,
  suggestion: { name: string; description: string; macros: Macros; frequency: number }
): Promise<FoodSuggestion | null> {
  try {
    const result = await sql`
      INSERT INTO food_suggestions (user_id, name, description, calories, protein, carbs, fat, frequency)
      VALUES (
        ${userId}, ${suggestion.name}, ${suggestion.description},
        ${suggestion.macros.calories}, ${suggestion.macros.protein},
        ${suggestion.macros.carbs}, ${suggestion.macros.fat},
        ${suggestion.frequency}
      )
      RETURNING id, name, description, calories, protein, carbs, fat, frequency, status, created_at;
    `;
    return mapFoodSuggestionRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating food suggestion:', error);
    return null;
  }
}

export async function updateFoodSuggestionStatus(
  userId: string,
  suggestionId: string,
  status: SuggestionStatus
): Promise<boolean> {
  try {
    const result = await sql`
      UPDATE food_suggestions
      SET status = ${status}
      WHERE id = ${suggestionId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error updating food suggestion status:', error);
    return false;
  }
}

export async function clearPendingSuggestions(userId: string): Promise<void> {
  try {
    await sql`
      UPDATE food_suggestions
      SET status = 'dismissed'
      WHERE user_id = ${userId} AND status = 'pending';
    `;
  } catch (error) {
    console.error('Error clearing pending suggestions:', error);
  }
}

export async function deleteAllFoodSuggestions(userId: string): Promise<void> {
  try {
    await sql`DELETE FROM food_suggestions WHERE user_id = ${userId};`;
  } catch (error) {
    console.error('Error deleting all food suggestions:', error);
  }
}

// ===== USER FACT FUNCTIONS =====

function mapUserFactRow(row: any): UserFact {
  return {
    id: row.id,
    category: row.category as FactCategory,
    content: row.content,
    source: row.source as FactSource,
    createdAt: new Date(row.created_at),
  };
}

export async function getUserFacts(userId: string): Promise<UserFact[]> {
  try {
    const result = await sql`
      SELECT id, category, content, source, created_at
      FROM user_facts
      WHERE user_id = ${userId}
      ORDER BY category, created_at DESC;
    `;
    return result.rows.map(mapUserFactRow);
  } catch (error) {
    console.error('Error getting user facts:', error);
    return [];
  }
}

export async function createUserFact(
  userId: string,
  fact: { category: FactCategory; content: string; source: FactSource }
): Promise<UserFact | null> {
  try {
    const result = await sql`
      INSERT INTO user_facts (user_id, category, content, source)
      VALUES (${userId}, ${fact.category}, ${fact.content}, ${fact.source})
      RETURNING id, category, content, source, created_at;
    `;
    return mapUserFactRow(result.rows[0]);
  } catch (error) {
    console.error('Error creating user fact:', error);
    return null;
  }
}

export async function deleteUserFact(userId: string, factId: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM user_facts
      WHERE id = ${factId} AND user_id = ${userId};
    `;
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting user fact:', error);
    return false;
  }
}

export async function deleteAllUserFacts(userId: string): Promise<void> {
  try {
    await sql`DELETE FROM user_facts WHERE user_id = ${userId};`;
  } catch (error) {
    console.error('Error deleting all user facts:', error);
  }
}

export async function createUserFactsBatch(
  userId: string,
  facts: Array<{ category: FactCategory; content: string; source: FactSource }>
): Promise<UserFact[]> {
  const created: UserFact[] = [];
  for (const fact of facts) {
    const result = await createUserFact(userId, fact);
    if (result) created.push(result);
  }
  return created;
}

/** Delete all AI-extracted facts in the given categories (used to refresh behavioral facts) */
export async function deleteAiFactsByCategories(
  userId: string,
  categories: string[]
): Promise<void> {
  try {
    // sql tag doesn't support array params — use OR conditions
    for (const category of categories) {
      await sql`
        DELETE FROM user_facts
        WHERE user_id = ${userId}
          AND source = 'ai_extracted'
          AND category = ${category};
      `;
    }
  } catch (error) {
    console.error('Error deleting AI facts by categories:', error);
  }
}

export async function getRecentConversationIds(userId: string, limit: number = 3): Promise<string[]> {
  try {
    const result = await sql`
      SELECT id FROM chat_conversations
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT ${limit};
    `;
    return result.rows.map((r: any) => r.id);
  } catch (error) {
    console.error('Error getting recent conversation IDs:', error);
    return [];
  }
}

// ========================
// AI Souls
// ========================

function mapSoulRow(row: any): AiSoul {
  return {
    id: row.id,
    presetId: row.preset_id || null,
    name: row.name,
    soulContent: row.soul_content,
    userInput: row.user_input || null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getAiSoul(userId: string): Promise<AiSoul | null> {
  try {
    const result = await sql`
      SELECT * FROM ai_souls WHERE user_id = ${userId} LIMIT 1;
    `;
    if (result.rows.length === 0) return null;
    return mapSoulRow(result.rows[0]);
  } catch (error) {
    console.error('Error getting AI soul:', error);
    return null;
  }
}

export async function upsertAiSoul(
  userId: string,
  data: { presetId: string | null; name: string; soulContent: string; userInput: string | null }
): Promise<AiSoul | null> {
  try {
    const result = await sql`
      INSERT INTO ai_souls (user_id, preset_id, name, soul_content, user_input)
      VALUES (${userId}, ${data.presetId}, ${data.name}, ${data.soulContent}, ${data.userInput})
      ON CONFLICT (user_id)
      DO UPDATE SET
        preset_id = ${data.presetId},
        name = ${data.name},
        soul_content = ${data.soulContent},
        user_input = ${data.userInput},
        updated_at = NOW()
      RETURNING *;
    `;
    return mapSoulRow(result.rows[0]);
  } catch (error) {
    console.error('Error upserting AI soul:', error);
    return null;
  }
}

export async function deleteAiSoul(userId: string): Promise<boolean> {
  try {
    await sql`DELETE FROM ai_souls WHERE user_id = ${userId};`;
    return true;
  } catch (error) {
    console.error('Error deleting AI soul:', error);
    return false;
  }
}

// ===== DAILY HEALTH METRICS FUNCTIONS =====

function mapHealthMetricsRow(row: any): DailyHealthMetrics {
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateOnlyString(new Date(row.date)),
    steps: row.steps ?? undefined,
    activeCalories: row.active_calories ?? undefined,
    restingHeartRate: row.resting_heart_rate ?? undefined,
    sleepHours: row.sleep_hours ? Number(row.sleep_hours) : undefined,
    vo2Max: row.vo2_max ? Number(row.vo2_max) : undefined,
    weight: row.weight ? Number(row.weight) : undefined,
    distance: row.distance ? Number(row.distance) : undefined,
    exerciseMinutes: row.exercise_minutes ?? undefined,
    updatedAt: new Date(row.updated_at),
  };
}

export async function upsertDailyHealthMetrics(
  userId: string,
  date: string,
  metrics: {
    steps?: number;
    activeCalories?: number;
    restingHeartRate?: number;
    sleepHours?: number;
    vo2Max?: number;
    weight?: number;
    distance?: number;
    exerciseMinutes?: number;
  }
): Promise<DailyHealthMetrics | null> {
  try {
    const parsedDate = parseDateOnly(date);
    if (!parsedDate) throw new Error('Invalid date format, expected YYYY-MM-DD');
    const dateStr = toDateOnlyString(parsedDate);

    const result = await sql`
      INSERT INTO daily_health_metrics (
        user_id, date, steps, active_calories, resting_heart_rate, sleep_hours, vo2_max, weight, distance, exercise_minutes, updated_at
      ) VALUES (
        ${userId}, ${dateStr}, ${metrics.steps ?? null}, ${metrics.activeCalories ?? null},
        ${metrics.restingHeartRate ?? null}, ${metrics.sleepHours ?? null}, ${metrics.vo2Max ?? null},
        ${metrics.weight ?? null}, ${metrics.distance ?? null}, ${metrics.exerciseMinutes ?? null}, NOW()
      )
      ON CONFLICT (user_id, date) DO UPDATE SET
        steps = COALESCE(EXCLUDED.steps, daily_health_metrics.steps),
        active_calories = COALESCE(EXCLUDED.active_calories, daily_health_metrics.active_calories),
        resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, daily_health_metrics.resting_heart_rate),
        sleep_hours = COALESCE(EXCLUDED.sleep_hours, daily_health_metrics.sleep_hours),
        vo2_max = COALESCE(EXCLUDED.vo2_max, daily_health_metrics.vo2_max),
        weight = COALESCE(EXCLUDED.weight, daily_health_metrics.weight),
        distance = COALESCE(EXCLUDED.distance, daily_health_metrics.distance),
        exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, daily_health_metrics.exercise_minutes),
        updated_at = NOW()
      RETURNING *;
    `;

    return mapHealthMetricsRow(result.rows[0]);
  } catch (error) {
    console.error('Error upserting health metrics:', error);
    return null;
  }
}

export async function getDailyHealthMetrics(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyHealthMetrics[]> {
  try {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end) throw new Error('Invalid date format, expected YYYY-MM-DD');

    const result = await sql`
      SELECT *
      FROM daily_health_metrics
      WHERE user_id = ${userId}
      AND date >= ${toDateOnlyString(start)}
      AND date <= ${toDateOnlyString(end)}
      ORDER BY date ASC;
    `;

    return result.rows.map(mapHealthMetricsRow);
  } catch (error) {
    console.error('Error getting health metrics:', error);
    return [];
  }
}

export interface HealthSummaryMetric {
  avg: number;
  high: number;
  low: number;
}

export interface HealthSummary {
  steps: HealthSummaryMetric | null;
  activeCalories: HealthSummaryMetric | null;
  sleepHours: HealthSummaryMetric | null;
  weight: HealthSummaryMetric | null;
  restingHeartRate: HealthSummaryMetric | null;
  distance: HealthSummaryMetric | null;
  exerciseMinutes: HealthSummaryMetric | null;
}

export async function getHealthSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<HealthSummary> {
  try {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) throw new Error('Invalid date format, expected YYYY-MM-DD');

    const result = await sql`
      SELECT
        ROUND(AVG(steps))::int AS steps_avg,
        MAX(steps)::int AS steps_high,
        MIN(steps)::int AS steps_low,
        ROUND(AVG(active_calories))::int AS active_calories_avg,
        MAX(active_calories)::int AS active_calories_high,
        MIN(active_calories)::int AS active_calories_low,
        ROUND(AVG(sleep_hours)::numeric, 1) AS sleep_hours_avg,
        MAX(sleep_hours) AS sleep_hours_high,
        MIN(sleep_hours) AS sleep_hours_low,
        ROUND(AVG(weight)::numeric, 1) AS weight_avg,
        MAX(weight) AS weight_high,
        MIN(weight) AS weight_low,
        ROUND(AVG(resting_heart_rate))::int AS rhr_avg,
        MAX(resting_heart_rate)::int AS rhr_high,
        MIN(resting_heart_rate)::int AS rhr_low,
        ROUND(AVG(distance)::numeric, 2) AS distance_avg,
        MAX(distance) AS distance_high,
        MIN(distance) AS distance_low,
        ROUND(AVG(exercise_minutes))::int AS exercise_minutes_avg,
        MAX(exercise_minutes)::int AS exercise_minutes_high,
        MIN(exercise_minutes)::int AS exercise_minutes_low
      FROM daily_health_metrics
      WHERE user_id = ${userId}
      AND date >= ${toDateOnlyString(start)}
      AND date <= ${toDateOnlyString(end)}
      AND (steps IS NOT NULL OR active_calories IS NOT NULL OR sleep_hours IS NOT NULL OR weight IS NOT NULL OR resting_heart_rate IS NOT NULL OR distance IS NOT NULL OR exercise_minutes IS NOT NULL);
    `;

    const row = result.rows[0];
    if (!row) {
      return { steps: null, activeCalories: null, sleepHours: null, weight: null, restingHeartRate: null, distance: null, exerciseMinutes: null };
    }

    const buildMetric = (avg: any, high: any, low: any): HealthSummaryMetric | null => {
      if (avg == null) return null;
      return { avg: Number(avg), high: Number(high), low: Number(low) };
    };

    return {
      steps: buildMetric(row.steps_avg, row.steps_high, row.steps_low),
      activeCalories: buildMetric(row.active_calories_avg, row.active_calories_high, row.active_calories_low),
      sleepHours: buildMetric(row.sleep_hours_avg, row.sleep_hours_high, row.sleep_hours_low),
      weight: buildMetric(row.weight_avg, row.weight_high, row.weight_low),
      restingHeartRate: buildMetric(row.rhr_avg, row.rhr_high, row.rhr_low),
      distance: buildMetric(row.distance_avg, row.distance_high, row.distance_low),
      exerciseMinutes: buildMetric(row.exercise_minutes_avg, row.exercise_minutes_high, row.exercise_minutes_low),
    };
  } catch (error) {
    console.error('Error getting health summary:', error);
    return { steps: null, activeCalories: null, sleepHours: null, weight: null, restingHeartRate: null, distance: null, exerciseMinutes: null };
  }
}

export async function getWorkoutMinutesByDate(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  try {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) throw new Error('Invalid date format, expected YYYY-MM-DD');

    const result = await sql`
      SELECT
        date::date AS workout_date,
        SUM(
          CASE
            WHEN type = 'run' AND run_data IS NOT NULL
              THEN CEIL((run_data->>'durationSeconds')::numeric / 60)
            ELSE
              CEIL(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)
          END
        )::int AS total_minutes
      FROM workouts
      WHERE user_id = ${userId}
      AND date::date >= ${toDateOnlyString(start)}
      AND date::date <= ${toDateOnlyString(end)}
      GROUP BY date::date
      ORDER BY date::date ASC;
    `;

    const map: Record<string, number> = {};
    for (const row of result.rows) {
      map[toDateOnlyString(new Date(row.workout_date))] = row.total_minutes;
    }
    return map;
  } catch (error) {
    console.error('Error getting workout minutes:', error);
    return {};
  }
}

// ─── Device Tokens ──────────────────────────────────────────────────────

export async function upsertDeviceToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  await sql`
    INSERT INTO device_tokens (user_id, token, platform)
    VALUES (${userId}, ${token}, ${platform})
    ON CONFLICT (user_id, token)
    DO UPDATE SET updated_at = NOW();
  `;
}

export async function removeDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  await sql`
    DELETE FROM device_tokens
    WHERE user_id = ${userId} AND token = ${token};
  `;
}

export async function removeAllDeviceTokens(userId: string): Promise<void> {
  await sql`DELETE FROM device_tokens WHERE user_id = ${userId};`;
}

export async function getDeviceTokensForUser(
  userId: string,
): Promise<string[]> {
  const result = await sql`
    SELECT token FROM device_tokens WHERE user_id = ${userId};
  `;
  return result.rows.map((r) => r.token);
}

// ─── Notification Preferences ───────────────────────────────────────────

export interface NotificationPreferencesRow {
  inactivity_nudge: boolean;
  inactivity_days: number;
  weekly_summary: boolean;
}

export async function upsertNotificationPreferences(
  userId: string,
  prefs: {
    inactivityNudge: boolean;
    inactivityDays: number;
    weeklySummary: boolean;
  },
): Promise<NotificationPreferencesRow> {
  const result = await sql`
    INSERT INTO notification_preferences (user_id, inactivity_nudge, inactivity_days, weekly_summary)
    VALUES (${userId}, ${prefs.inactivityNudge}, ${prefs.inactivityDays}, ${prefs.weeklySummary})
    ON CONFLICT (user_id)
    DO UPDATE SET
      inactivity_nudge = ${prefs.inactivityNudge},
      inactivity_days = ${prefs.inactivityDays},
      weekly_summary = ${prefs.weeklySummary},
      updated_at = NOW()
    RETURNING inactivity_nudge, inactivity_days, weekly_summary;
  `;
  return result.rows[0] as NotificationPreferencesRow;
}

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferencesRow | null> {
  const result = await sql`
    SELECT inactivity_nudge, inactivity_days, weekly_summary
    FROM notification_preferences
    WHERE user_id = ${userId};
  `;
  return (result.rows[0] as NotificationPreferencesRow) ?? null;
}

// ─── Notification Cron Queries ──────────────────────────────────────────

export interface InactivityCandidate {
  userId: string;
  inactivityDays: number;
  daysSinceLastWorkout: number;
  tokens: string[];
}

export async function getInactivityNudgeCandidates(): Promise<
  InactivityCandidate[]
> {
  const result = await sql`
    SELECT
      np.user_id,
      np.inactivity_days,
      array_agg(dt.token) AS tokens,
      COALESCE(
        EXTRACT(DAY FROM NOW() - MAX(w.date))::int,
        999
      ) AS days_since
    FROM notification_preferences np
    JOIN device_tokens dt ON dt.user_id = np.user_id
    LEFT JOIN workouts w ON w.user_id = np.user_id
    WHERE np.inactivity_nudge = true
    GROUP BY np.user_id, np.inactivity_days
    HAVING COALESCE(
      EXTRACT(DAY FROM NOW() - MAX(w.date))::int,
      999
    ) >= np.inactivity_days;
  `;
  return result.rows.map((r) => ({
    userId: r.user_id,
    inactivityDays: r.inactivity_days,
    daysSinceLastWorkout: r.days_since,
    tokens: r.tokens,
  }));
}

export interface WeeklySummaryCandidate {
  userId: string;
  name: string;
  tokens: string[];
  workouts: number;
  meals: number;
  avgCalories: number;
}

export async function getWeeklySummaryCandidates(): Promise<
  WeeklySummaryCandidate[]
> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = toDateOnlyString(sevenDaysAgo);

  const result = await sql`
    SELECT
      np.user_id,
      u.name,
      array_agg(DISTINCT dt.token) AS tokens,
      COALESCE((
        SELECT COUNT(*)::int FROM workouts w
        WHERE w.user_id = np.user_id AND w.date >= ${since}::timestamp
      ), 0) AS workout_count,
      COALESCE((
        SELECT COUNT(*)::int FROM meals m
        WHERE m.user_id = np.user_id AND m.date >= ${since}::date
      ), 0) AS meal_count,
      COALESCE((
        SELECT AVG(m2.calories)::int FROM meals m2
        WHERE m2.user_id = np.user_id AND m2.date >= ${since}::date
      ), 0) AS avg_calories
    FROM notification_preferences np
    JOIN device_tokens dt ON dt.user_id = np.user_id
    JOIN users u ON u.id = np.user_id
    WHERE np.weekly_summary = true
    GROUP BY np.user_id, u.name;
  `;
  return result.rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    tokens: r.tokens,
    workouts: r.workout_count,
    meals: r.meal_count,
    avgCalories: r.avg_calories,
  }));
}

// ==================== Progressive Overload ====================

export interface ExerciseHistoryEntry {
  workoutDate: string;
  exercisePosition: number;
  weight: string;
  weightsPerSet?: (string | 'BW')[];
  sets: number;
  reps: number;
  repsPerSet?: number[];
}

export interface RecommendationRow {
  exerciseName: string;
  exercisePosition: number;
  recommendedWeight: string | null;
  recommendedReps: number | null;
  recommendationType: string;
  recommendationText: string | null;
  confidence: string;
  stallCount: number;
  basedOnSessions: number;
}

export interface ProgressionParams {
  exerciseName: string;
  exerciseCategory: string;
  weightIncrement: number | null;
  weightIncrementPct: number | null;
  stallThreshold: number;
  deloadPct: number;
  minIncrement: number;
  maxIncrement: number;
  successRate: number | null;
  lastAnalyzedAt: string | null;
}

const DEFAULT_PROGRESSION_PARAMS: Omit<ProgressionParams, 'exerciseName'> = {
  exerciseCategory: 'unknown',
  weightIncrement: null,
  weightIncrementPct: 5.0,
  stallThreshold: 3,
  deloadPct: 10.0,
  minIncrement: 2.5,
  maxIncrement: 10.0,
  successRate: null,
  lastAnalyzedAt: null,
};

// Fetch exercise history for a specific exercise within a specific workout context (preset)
export async function getWorkoutHistoryForContext(
  userId: string,
  presetName: string,
  exerciseName: string,
  limit: number = 10
): Promise<ExerciseHistoryEntry[]> {
  try {
    const result = await sql`
      SELECT exercises, date
      FROM workouts
      WHERE user_id = ${userId}
        AND LOWER(name) = LOWER(${presetName})
        AND type = 'strength'
      ORDER BY date DESC
      LIMIT ${limit};
    `;

    const entries: ExerciseHistoryEntry[] = [];
    const nameLower = exerciseName.toLowerCase();

    for (const row of result.rows) {
      const exercises: Exercise[] = Array.isArray(row.exercises) ? row.exercises : [];
      for (let i = 0; i < exercises.length; i++) {
        if (exercises[i].name.toLowerCase() === nameLower) {
          const ex = exercises[i];
          entries.push({
            workoutDate: new Date(row.date).toISOString().split('T')[0],
            exercisePosition: i,
            weight: ex.weight || 'BW',
            weightsPerSet: ex.weightsPerSet,
            sets: ex.sets || ex.repsPerSet?.length || 0,
            reps: ex.reps || 0,
            repsPerSet: ex.repsPerSet,
          });
          break; // one match per workout
        }
      }
    }

    return entries;
  } catch (error) {
    console.error('Error fetching workout history for context:', error);
    return [];
  }
}

// Upsert a single exercise recommendation
export async function upsertExerciseRecommendation(
  userId: string,
  data: {
    presetName: string;
    exerciseName: string;
    exercisePosition: number;
    recommendedWeight: string | null;
    recommendedReps: number | null;
    recommendationType: string;
    recommendationText: string | null;
    confidence: string;
    basedOnSessions: number;
    stallCount: number;
  }
): Promise<void> {
  try {
    await sql`
      INSERT INTO exercise_recommendations (
        user_id, preset_name, exercise_name, exercise_position,
        recommended_weight, recommended_reps, recommendation_type,
        recommendation_text, confidence, based_on_sessions, stall_count,
        created_at, updated_at
      ) VALUES (
        ${userId}, ${data.presetName}, ${data.exerciseName}, ${data.exercisePosition},
        ${data.recommendedWeight}, ${data.recommendedReps}, ${data.recommendationType},
        ${data.recommendationText}, ${data.confidence}, ${data.basedOnSessions}, ${data.stallCount},
        NOW(), NOW()
      )
      ON CONFLICT (user_id, preset_name, exercise_name, exercise_position)
      DO UPDATE SET
        recommended_weight = EXCLUDED.recommended_weight,
        recommended_reps = EXCLUDED.recommended_reps,
        recommendation_type = EXCLUDED.recommendation_type,
        recommendation_text = EXCLUDED.recommendation_text,
        confidence = EXCLUDED.confidence,
        based_on_sessions = EXCLUDED.based_on_sessions,
        stall_count = EXCLUDED.stall_count,
        updated_at = NOW();
    `;
  } catch (error) {
    console.error('Error upserting exercise recommendation:', error);
  }
}

// Get all recommendations for a preset
export async function getRecommendationsForPreset(
  userId: string,
  presetName: string
): Promise<RecommendationRow[]> {
  try {
    const result = await sql`
      SELECT
        exercise_name, exercise_position,
        recommended_weight, recommended_reps,
        recommendation_type, recommendation_text,
        confidence, stall_count, based_on_sessions
      FROM exercise_recommendations
      WHERE user_id = ${userId}
        AND LOWER(preset_name) = LOWER(${presetName})
      ORDER BY exercise_position ASC;
    `;

    return result.rows.map((r) => ({
      exerciseName: r.exercise_name,
      exercisePosition: r.exercise_position,
      recommendedWeight: r.recommended_weight,
      recommendedReps: r.recommended_reps,
      recommendationType: r.recommendation_type,
      recommendationText: r.recommendation_text,
      confidence: r.confidence,
      stallCount: r.stall_count,
      basedOnSessions: r.based_on_sessions,
    }));
  } catch (error) {
    console.error('Error getting recommendations for preset:', error);
    return [];
  }
}

// Get progression params for an exercise, falling back to defaults
export async function getProgressionParams(
  userId: string,
  exerciseName: string
): Promise<ProgressionParams> {
  try {
    const result = await sql`
      SELECT
        exercise_name, exercise_category,
        weight_increment, weight_increment_pct,
        stall_threshold, deload_pct,
        min_increment, max_increment,
        success_rate, last_analyzed_at
      FROM progression_params
      WHERE user_id = ${userId}
        AND LOWER(exercise_name) = LOWER(${exerciseName})
      LIMIT 1;
    `;

    if (result.rows.length > 0) {
      const r = result.rows[0];
      return {
        exerciseName: r.exercise_name,
        exerciseCategory: r.exercise_category || 'unknown',
        weightIncrement: r.weight_increment ? parseFloat(r.weight_increment) : null,
        weightIncrementPct: r.weight_increment_pct ? parseFloat(r.weight_increment_pct) : 5.0,
        stallThreshold: r.stall_threshold ?? 3,
        deloadPct: r.deload_pct ? parseFloat(r.deload_pct) : 10.0,
        minIncrement: r.min_increment ? parseFloat(r.min_increment) : 2.5,
        maxIncrement: r.max_increment ? parseFloat(r.max_increment) : 10.0,
        successRate: r.success_rate ? parseFloat(r.success_rate) : null,
        lastAnalyzedAt: r.last_analyzed_at ? new Date(r.last_analyzed_at).toISOString() : null,
      };
    }

    return { exerciseName, ...DEFAULT_PROGRESSION_PARAMS };
  } catch (error) {
    console.error('Error getting progression params:', error);
    return { exerciseName, ...DEFAULT_PROGRESSION_PARAMS };
  }
}

// Upsert AI-tuned progression params
export async function upsertProgressionParams(
  userId: string,
  exerciseName: string,
  params: {
    exerciseCategory?: string;
    weightIncrement?: number | null;
    weightIncrementPct?: number | null;
    stallThreshold?: number;
    deloadPct?: number;
    minIncrement?: number;
    maxIncrement?: number;
    successRate?: number | null;
  }
): Promise<void> {
  try {
    await sql`
      INSERT INTO progression_params (
        user_id, exercise_name, exercise_category,
        weight_increment, weight_increment_pct,
        stall_threshold, deload_pct,
        min_increment, max_increment,
        success_rate, last_analyzed_at,
        created_at, updated_at
      ) VALUES (
        ${userId}, ${exerciseName}, ${params.exerciseCategory || 'unknown'},
        ${params.weightIncrement ?? null}, ${params.weightIncrementPct ?? 5.0},
        ${params.stallThreshold ?? 3}, ${params.deloadPct ?? 10.0},
        ${params.minIncrement ?? 2.5}, ${params.maxIncrement ?? 10.0},
        ${params.successRate ?? null}, NOW(),
        NOW(), NOW()
      )
      ON CONFLICT (user_id, exercise_name)
      DO UPDATE SET
        exercise_category = COALESCE(EXCLUDED.exercise_category, progression_params.exercise_category),
        weight_increment = EXCLUDED.weight_increment,
        weight_increment_pct = EXCLUDED.weight_increment_pct,
        stall_threshold = EXCLUDED.stall_threshold,
        deload_pct = EXCLUDED.deload_pct,
        min_increment = EXCLUDED.min_increment,
        max_increment = EXCLUDED.max_increment,
        success_rate = EXCLUDED.success_rate,
        last_analyzed_at = NOW(),
        updated_at = NOW();
    `;
  } catch (error) {
    console.error('Error upserting progression params:', error);
  }
}

// Bulk query: get recent workouts with full exercise data (for the async agent)
export async function getRecentWorkoutsWithExercises(
  userId: string,
  sinceDate: string
): Promise<Array<{ id: string; name: string; date: string; exercises: Exercise[] }>> {
  try {
    const result = await sql`
      SELECT id, name, date, exercises
      FROM workouts
      WHERE user_id = ${userId}
        AND date >= ${sinceDate}::date
        AND type = 'strength'
      ORDER BY date DESC;
    `;

    return result.rows.map((r) => ({
      id: r.id,
      name: r.name || '',
      date: new Date(r.date).toISOString().split('T')[0],
      exercises: Array.isArray(r.exercises) ? r.exercises : [],
    }));
  } catch (error) {
    console.error('Error getting recent workouts with exercises:', error);
    return [];
  }
}

// Get the latest last_analyzed_at for a user's progression params
export async function getLastProgressionAnalysis(userId: string): Promise<Date | null> {
  try {
    const result = await sql`
      SELECT MAX(last_analyzed_at) as last_analyzed
      FROM progression_params
      WHERE user_id = ${userId};
    `;
    if (result.rows.length > 0 && result.rows[0].last_analyzed) {
      return new Date(result.rows[0].last_analyzed);
    }
    return null;
  } catch (error) {
    console.error('Error getting last progression analysis:', error);
    return null;
  }
}

// Get total workout count for a user (for agent trigger throttling)
export async function getUserWorkoutCount(userId: string): Promise<number> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM workouts WHERE user_id = ${userId};
    `;
    return parseInt(result.rows[0].count, 10) || 0;
  } catch (error) {
    console.error('Error getting user workout count:', error);
    return 0;
  }
}
