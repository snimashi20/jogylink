import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH, POST } from '../app/backend/[...path]/route';

const TOKEN = 'abc.def.ghi';
const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const req = (
  method: string,
  url: string,
  init: { cookie?: string | null; json?: boolean; body?: string } = {},
) => {
  const headers: Record<string, string> = {};
  if (init.cookie !== null) headers.cookie = init.cookie ?? `jogylink_session=${TOKEN}`;
  if (init.json !== false && method !== 'GET') headers['content-type'] = 'application/json';
  return new Request(`http://web${url}`, { method, headers, body: init.body });
};

const ok = (status = 200, body: unknown = { ok: true }) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.unstubAllGlobals());

describe('/backend proxy', () => {
  it('adds the login token from the cookie and forwards the path and query', async () => {
    const fetchMock = ok(200, [{ id: 1 }]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(req('GET', '/backend/products?x=1'), ctx('products'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/products\?x=1$/);
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('forwards a write body as JSON', async () => {
    const fetchMock = ok(201);
    vi.stubGlobal('fetch', fetchMock);
    await POST(req('POST', '/backend/products', { body: '{"sku":"A"}' }), ctx('products'));
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"sku":"A"}');
  });

  it('refuses without a cookie, and never calls the API', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(req('GET', '/backend/products', { cookie: null }), ctx('products'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a write that is not JSON (blocks cross-site form posts)', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    const res = await PATCH(
      req('PATCH', '/backend/products/1', { json: false, body: 'a=b' }),
      ctx('products', '1'),
    );
    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses paths that try to climb out of the API', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    for (const path of [['..', 'health'], ['products', '..'], ['.'], [''], ['a%2Fb'], ['a%5Cb']]) {
      const res = await GET(req('GET', '/backend/x'), ctx(...path));
      expect(res.status, path.join('/')).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the API status through (403, 409) so the screen can react', async () => {
    vi.stubGlobal('fetch', ok(409, { message: 'taken' }));
    const res = await POST(req('POST', '/backend/products', { body: '{}' }), ctx('products'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: 'taken' });
  });

  it('answers 502 when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect((await GET(req('GET', '/backend/products'), ctx('products'))).status).toBe(502);
  });
});
