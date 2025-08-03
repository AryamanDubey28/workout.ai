import { sql } from '@vercel/postgres';
import { User, CreateUserData } from '@/types/user';
import bcrypt from 'bcryptjs';

// Initialize the database table
export async function initDatabase() {
  try {
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
    const user = await getUserByEmail(email);
    if (!user || !user.password) return null;
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return null;
    
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