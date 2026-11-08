import { NextResponse } from 'next/server';
import { LoginRequestSchema, LoginResponseSchema } from '@jogylink/shared';
import { API_URL, SESSION_COOKIE } from '../../lib/config';
import { secondsUntilExpiry } from '../../lib/token';

/**
 * Sign in: the browser posts the username and password here, this server forwards them to the
 * API, and the token goes into an httpOnly cookie. The token never reaches page JavaScript, so a
 * script injected into the page cannot steal it, and the browser never talks to the API directly.
 */
export async function POST(request: Request) {
  const parsed = LoginRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a username and a password.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The API throttles wrong passwords per client address, so pass the real one along.
        ...forwardedFor(request),
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'The server could not be reached.' }, { status: 502 });
  }

  if (!upstream.ok) {
    const body = (await upstream.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message : 'Sign-in failed.';
    return NextResponse.json(
      { message },
      { status: upstream.status === 429 ? 429 : upstream.status === 401 ? 401 : 502 },
    );
  }

  const login = LoginResponseSchema.safeParse(await upstream.json().catch(() => null));
  if (!login.success) {
    return NextResponse.json({ message: 'The server sent an unexpected reply.' }, { status: 502 });
  }

  const response = NextResponse.json({ user: login.data.user });
  response.cookies.set(SESSION_COOKIE, login.data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: secondsUntilExpiry(login.data.accessToken),
  });
  return response;
}

/** Sign out: forget the cookie. */
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

function forwardedFor(request: Request): Record<string, string> {
  const ip = request.headers.get('x-forwarded-for');
  return ip ? { 'X-Forwarded-For': ip } : {};
}
