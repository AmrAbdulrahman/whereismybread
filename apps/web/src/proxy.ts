import { auth } from '@wib/auth/edge';
import { NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/d',
  '/api/auth',
  // The handler authenticates each request itself (owning user, or an
  // OTP-verified debt viewer with no app account).
  '/api/attachments',
  '/privacy-policy',
  '/terms-and-conditions',
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!req.auth && !isPublic) {
    const url = new URL('/login', req.nextUrl);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (req.auth && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/plan', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/version|api/health|api/bank-sync|.*\\.\\w+$).*)',
  ],
};
