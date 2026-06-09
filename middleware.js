// middleware.js
// Protects /home, /orders, /account, /[clientId] (store menu + checkout).
// Unauthenticated requests are redirected to /login.
// Public routes: /login, /signup, /api/auth/*

import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth'];

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // Allow all public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals + static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json'
  ) {
    return NextResponse.next();
  }

  const session = getSessionFromCookies(req.cookies);
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    // Preserve intended destination so login can redirect back
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
