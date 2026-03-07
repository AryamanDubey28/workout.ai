import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getUserById, updateUser } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getUserById(session.userId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
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
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { weight, dateOfBirth } = body;

    if (weight === undefined && dateOfBirth === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    if (weight !== undefined && (typeof weight !== 'number' || weight <= 0 || weight > 1000)) {
      return NextResponse.json(
        { error: 'Invalid weight' },
        { status: 400 }
      );
    }

    if (dateOfBirth !== undefined && typeof dateOfBirth === 'string') {
      const parsed = new Date(dateOfBirth);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date of birth' },
          { status: 400 }
        );
      }
    }

    const user = await updateUser(session.userId, { weight, dateOfBirth });
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
