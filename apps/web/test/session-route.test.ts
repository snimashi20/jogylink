import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, POST } from '../app/session/route';

const user = {
  id: '5f0a3c0e-6a0e-4c1e-9d55-2f2f6c1d9a11',
  name: 'Owner',
  username: 'owner',
  role: 'owner',
  active: true,
  createdAt: new Date().toISOString(),
};
const token = `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.s`;

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://web/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const upstream = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('POST /session (sign in)', () => {
  it('stores the token in an httpOnly cookie and never in the response body', async () => {
    vi.stubGlobal('fetch', upstream(200, { accessToken: token, user }));
    const res = await send({ username: 'owner', password: 'pw' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(token);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`jogylink_session=${token}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=3[56]\d\d/);
  });

  it('passes the credentials and the client address to the API', async () => {
    const fetchMock = upstream(200, { accessToken: token, user });
    vi.stubGlobal('fetch', fetchMock);
    await send({ username: 'owner', password: 'pw' }, { 'x-forwarded-for': '203.0.113.9' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(JSON.parse(init.body)).toEqual({ username: 'owner', password: 'pw' });
    expect(init.headers['X-Forwarded-For']).toBe('203.0.113.9');
  });

  it('sets no cookie when the password is wrong', async () => {
    vi.stubGlobal('fetch', upstream(401, { message: 'Invalid username or password' }));
    const res = await send({ username: 'owner', password: 'bad' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('passes a lock-out through as 429', async () => {
    vi.stubGlobal('fetch', upstream(429, { message: 'Too many attempts' }));
    expect((await send({ username: 'owner', password: 'bad' })).status).toBe(429);
  });

  it('answers 502 when the API is down or sends something unexpected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect((await send({ username: 'o', password: 'p' })).status).toBe(502);

    vi.stubGlobal('fetch', upstream(200, { nonsense: true }));
    const res = await send({ username: 'o', password: 'p' });
    expect(res.status).toBe(502);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a missing or malformed body with 400 without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await send({ username: 'owner' })).status).toBe(400);
    expect((await send('not json')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /session (sign out)', () => {
  it('expires the cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(204);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('jogylink_session=;');
    expect(cookie).toMatch(/Max-Age=0/);
  });
});
