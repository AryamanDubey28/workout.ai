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