import { NextRequest, NextResponse } from 'next/server';
import { getSessionToken, verifySession } from '@/lib/auth';

// Define public routes that don't require authentication
const publicRoutes = ['/api/auth/login', '/api/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow all public routes and static files
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Get session token from cookies
  const token = request.cookies.get('workout-ai-session')?.value;

  // If no token and accessing protected route, show auth form
  if (!token) {
    // For API routes, return 401
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // For pages, continue to show the auth form (handled in the page component)
    return NextResponse.next();
  }

  // Verify the token
  const session = await verifySession(token);
  
  if (!session) {
    // Invalid token, clear it and redirect to auth
    const response = NextResponse.next();
    response.cookies.delete('workout-ai-session');
    
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }
    
    return response;
  }

  // Valid session, continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};