import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, initDatabase } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { LoginData } from '@/types/user';

export async function POST(request: NextRequest) {
  try {
    // Initialize database if not already done
    await initDatabase();
    const body: LoginData = await request.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Verify user credentials
    console.log('Attempting to verify user with email:', email);
    const user = await verifyUser(email, password);
    
    if (!user) {
      console.log('User verification failed for email:', email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    console.log('User verification successful for email:', email);

    // Create session
    const token = await createSession(user);
    await setSessionCookie(token);

    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        age: user.age,
        dateOfBirth: user.dateOfBirth,
        weight: user.weight
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
