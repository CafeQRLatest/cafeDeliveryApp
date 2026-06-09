// middleware.js
// Edge Runtime session guard — protects authenticated routes.
//
// ⚠️  Edge Runtime CANNOT use Node.js built-ins (crypto, buffer, etc.).
//     We therefore do NOT import lib/auth.js here.
//     Instead we perform a lightweight cookie-presence check:
//       – if the delivery_session cookie exists → let the request through
//       – if it is absent               → redirect to /login
//
// Full HMAC signature verification happens inside each pages/api/* route
// (Node.js runtime) via getSessionFromReq() from lib/auth.js.
// This means a tampered/expired cookie will still reach a protected page
// but will be rejected the moment it tries to call any API route.
// For a delivery ordering app this is an acceptable tradeoff — the page
// shell loads, but no data is served without a valid session.

import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'delivery_session';

// Paths that are always public — no cookie required
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/api/auth',
  '/_next',
  '/favicon',
  '/icons',
  '/firebase-messaging-sw.js',
];
const PUBLIC_EXACT = ['/manifest.json'];

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Lightweight cookie-presence check (no crypto — Edge-safe)
  const sessionCookie = req.cookies.get(SESSION_COOKIE);
  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
