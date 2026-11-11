import { describe, expect, it, vi } from 'vitest';
import { AuthController, SESSION_ENDED } from '../src/auth/controller';
import { createAuthApi } from '../src/auth/api';
import type { AuthApi, CheckResult, SessionStorage, StoredSession } from '../src/auth/types';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sam',
  username: 'sam',
  role: 'worker' as const,
  active: true,
  createdAt: new Date('2026-01-01'),
};

function memoryStorage(
  initial: StoredSession | null = null,
): SessionStorage & { value: StoredSession | null } {
  const s = {
    value: initial,
    load: async () => s.value,
    save: async (v: StoredSession) => void (s.value = v),
    clear: async () => void (s.value = null),
  };
  return s;
}

function setup(
  opts: {
    stored?: StoredSession | null;
    check?: CheckResult;
    guard?: () => Promise<string | null>;
  } = {},
) {
  const storage = memoryStorage(opts.stored ?? null);
  const api: AuthApi = {
    login: vi.fn(async () => ({ ok: true as const, token: 'tok', user })),
    check: vi.fn(async () => opts.check ?? { kind: 'valid' as const, user }),
  };
  const controller = new AuthController({ storage, api, guardSignOut: opts.guard });
  return { storage, api, controller };
}

describe('AuthController', () => {
  it('starts signed out when nothing is saved', async () => {
    const { controller } = setup();
    await controller.start();
    expect(controller.getState()).toEqual({ status: 'signed-out' });
  });

  it('opens signed in from the saved login, then verifies it', async () => {
    const { controller } = setup({ stored: { token: 't', user } });
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'signed-in', verification: 'verified' });
  });

  it('stays signed in with no signal', async () => {
    const { controller, storage } = setup({
      stored: { token: 't', user },
      check: { kind: 'offline' },
    });
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'signed-in', verification: 'offline' });
    expect(storage.value).not.toBeNull();
  });

  it('signs out with a clear notice when the server rejects the login', async () => {
    const { controller, storage } = setup({
      stored: { token: 't', user },
      check: { kind: 'rejected' },
    });
    await controller.start();
    expect(controller.getState()).toEqual({ status: 'signed-out', notice: SESSION_ENDED });
    expect(storage.value).toBeNull();
  });

  it("takes the server's copy of the user (role changes apply)", async () => {
    const owner = { ...user, role: 'owner' as const };
    const { controller, storage } = setup({
      stored: { token: 't', user },
      check: { kind: 'valid', user: owner },
    });
    await controller.start();
    expect(controller.getState()).toMatchObject({ user: { role: 'owner' } });
    expect(storage.value?.user.role).toBe('owner');
  });

  it('survives unreadable storage', async () => {
    const { controller, storage } = setup();
    storage.load = async () => {
      throw new Error('keystore broke');
    };
    await controller.start();
    expect(controller.getState().status).toBe('signed-out');
  });

  it('signs in, trims and lowercases the username, and saves the session', async () => {
    const { controller, api, storage } = setup();
    const result = await controller.signIn('  Sam ', 'secret123');
    expect(result.ok).toBe(true);
    expect(api.login).toHaveBeenCalledWith('sam', 'secret123');
    expect(storage.value?.token).toBe('tok');
    expect(controller.getToken()).toBe('tok');
  });

  it('stays signed out and saves nothing when login fails', async () => {
    const { controller, api, storage } = setup();
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'invalid' });
    const result = await controller.signIn('sam', 'wrong');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(storage.value).toBeNull();
    expect(controller.getToken()).toBeNull();
  });

  it('signs out and clears the saved login', async () => {
    const { controller, storage } = setup({ stored: { token: 't', user } });
    await controller.start();
    expect(await controller.signOut()).toBeNull();
    expect(controller.getState()).toEqual({ status: 'signed-out', notice: undefined });
    expect(storage.value).toBeNull();
  });

  it('refuses to sign out while the guard says sales are unsent', async () => {
    const { controller, storage } = setup({
      stored: { token: 't', user },
      guard: async () => '3 sales have not been sent yet.',
    });
    await controller.start();
    expect(await controller.signOut()).toBe('3 sales have not been sent yet.');
    expect(controller.getState().status).toBe('signed-in');
    expect(storage.value).not.toBeNull();
  });

  it('goes back to sign-in when any request returns 401', async () => {
    const { controller } = setup({ stored: { token: 't', user } });
    await controller.start();
    await controller.handleUnauthorized();
    expect(controller.getState()).toMatchObject({ status: 'signed-out', notice: SESSION_ENDED });
  });

  it('ignores a late check result after the person signed out', async () => {
    let release: (r: CheckResult) => void = () => {};
    const { controller, api } = setup({ stored: { token: 't', user } });
    (api.check as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => (release = r)));
    const started = controller.start();
    await Promise.resolve();
    await Promise.resolve();
    await controller.signOut();
    release({ kind: 'valid', user });
    await started;
    expect(controller.getState().status).toBe('signed-out');
  });

  it('notifies subscribers on change', async () => {
    const { controller } = setup();
    const fn = vi.fn();
    controller.subscribe(fn);
    await controller.signIn('sam', 'x');
    expect(fn).toHaveBeenCalled();
  });
});

describe('createAuthApi', () => {
  const json = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });
  const login = (f: typeof fetch) => createAuthApi('http://x/api', f).login('sam', 'pw');
  const wire = { ...user, createdAt: '2026-01-01T00:00:00.000Z' };

  it('maps statuses to reasons', async () => {
    expect(await login(json(401, {}))).toEqual({ ok: false, reason: 'invalid' });
    expect(await login(json(429, {}))).toEqual({ ok: false, reason: 'locked' });
    expect(await login(json(500, {}))).toEqual({ ok: false, reason: 'server' });
    expect(
      await login(async () => {
        throw new TypeError('Network request failed');
      }),
    ).toEqual({ ok: false, reason: 'offline' });
  });

  it('rejects a malformed success body', async () => {
    expect(await login(json(200, { nope: true }))).toEqual({ ok: false, reason: 'server' });
  });

  it('parses a good login', async () => {
    const r = await login(json(200, { accessToken: 'abc', user: wire }));
    expect(r).toMatchObject({ ok: true, token: 'abc', user: { username: 'sam' } });
  });

  it('check: 401 rejects, failures and 5xx count as offline, 200 is valid', async () => {
    const check = (f: typeof fetch) => createAuthApi('http://x/api', f).check('t');
    expect(await check(json(401, {}))).toEqual({ kind: 'rejected' });
    expect(await check(json(503, {}))).toEqual({ kind: 'offline' });
    expect(
      await check(async () => {
        throw new Error('x');
      }),
    ).toEqual({ kind: 'offline' });
    expect(await check(json(200, wire))).toMatchObject({ kind: 'valid' });
  });
});
