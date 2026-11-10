import { NextResponse } from 'next/server';
import { API_URL, SESSION_COOKIE } from '../../../lib/config';

/**
 * The browser's only way to reach the API. It adds the login token from the httpOnly cookie, so
 * page JavaScript can call the API without ever holding the token. The API still decides who may
 * do what: this route adds no permissions of its own.
 *
 * Writes must be JSON. A cross-site HTML form cannot send JSON without the browser first asking
 * permission, so together with the SameSite cookie this blocks cross-site request forgery.
 */
type Context = { params: Promise<{ path: string[] }> };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function forward(request: Request, { params }: Context): Promise<Response> {
  const segments = (await params).path;
  // Refuse anything that could climb out of the API's /api/ prefix.
  if (
    segments.some((s) => s === '' || s === '.' || s === '..' || /[\\/]/.test(decodeURIComponent(s)))
  ) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const cookie = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : '';
  if (!token) return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });

  const isWrite = WRITE_METHODS.has(request.method);
  if (isWrite && !request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ message: 'Send JSON.' }, { status: 415 });
  }

  const url = new URL(request.url);
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/${segments.join('/')}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isWrite ? { 'Content-Type': 'application/json' } : {}),
      },
      body: isWrite ? await request.text() : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'The server could not be reached.' }, { status: 502 });
  }

  return new NextResponse(upstream.status === 204 ? null : await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
