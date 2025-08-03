import { NextRequest, NextResponse } from 'next/server';
import { createUser, emailExists, initDatabase } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { RegisterData } from '@/types/user';

const REGISTRATION_SECRET = process.env.REGISTRATION_SECRET || 'change-this-secret';

export async function POST(request: NextRequest) {
  try {
    // Initialize database if not already done
    await initDatabase();
    
    const body: RegisterData = await request.json();
    const { secretPassword, name, email, age, weight, password } = body;

    // Validate registration secret
    if (secretPassword !== REGISTRATION_SECRET) {
      return NextResponse.json(
        { error: 'Invalid registration secret' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!name || !email || !age || !weight || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists
    if (await emailExists(email)) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Create user
    const user = await createUser({ name, email, age, weight, password });
    
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create session
    const token = await createSession(user);
    await setSessionCookie(token);

    return NextResponse.json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        age: user.age,
        weight: user.weight
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}