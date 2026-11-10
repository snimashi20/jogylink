import { Controller, Get } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '@jogylink/db';
import { LoginResponseSchema, UserSchema } from '@jogylink/shared';
import { Roles } from '../src/auth/decorators';
import {
  bearer,
  createTestApp,
  OWNER_PASSWORD,
  WORKER_PASSWORD,
  type TestApp,
} from './helpers/test-app';

/** Stands in for another member's module, to prove the global guards protect their routes. */
@Controller('probe')
class ProbeController {
  @Get('any')
  any(): { ok: true } {
    return { ok: true };
  }

  @Roles('owner')
  @Get('owner-only')
  ownerOnly(): { ok: true } {
    return { ok: true };
  }
}

let t: TestApp;

const login = (username: string, password: string) => t.login(username, password);
const tokenFor = (username: string, password: string) => t.tokenFor(username, password);

async function userId(username: string): Promise<string> {
  const [row] = await t.db.select().from(users).where(eq(users.username, username));
  return row!.id;
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

beforeAll(async () => {
  t = await createTestApp({ controllers: [ProbeController] });
});

afterAll(() => t.close());

beforeEach(() => t.limiter.clear());

describe('health', () => {
  it('is public', async () => {
    const res = await t.http.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/auth/login', () => {
  it('logs in the owner and returns a token plus the user, without any password data', async () => {
    const res = await login('owner', OWNER_PASSWORD);
    expect(res.status).toBe(200);
    const parsed = LoginResponseSchema.parse(res.body);
    expect(parsed.user.role).toBe('owner');
    expect(parsed.user.username).toBe('owner');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  });

  it('treats the username as case-insensitive and ignores surrounding spaces', async () => {
    const res = await login('  OWNER ', OWNER_PASSWORD);
    expect(res.status).toBe(200);
  });

  it('gives the same 401 for a wrong password and an unknown user', async () => {
    const wrong = await login('owner', 'not-the-password');
    const unknown = await login('nobody', 'whatever-123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rejects a deactivated account even with the right password', async () => {
    await t.db.update(users).set({ active: false }).where(eq(users.username, 'worker'));
    try {
      const res = await login('worker', WORKER_PASSWORD);
      expect(res.status).toBe(401);
    } finally {
      await t.db.update(users).set({ active: true }).where(eq(users.username, 'worker'));
    }
  });

  it('rejects a malformed body with 400 and a list of problems', async () => {
    const res = await t.http.post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('locks after repeated wrong passwords, even for the right password, but only for that user', async () => {
    for (let i = 0; i < 3; i++) expect((await login('worker', 'bad-password')).status).toBe(401);

    const locked = await login('worker', WORKER_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);

    expect((await login('owner', OWNER_PASSWORD)).status).toBe(200);
  });
});

describe('GET /api/auth/me and the global JWT guard', () => {
  it('rejects a request with no token', async () => {
    expect((await t.http.get('/api/auth/me')).status).toBe(401);
    expect((await t.http.get('/api/probe/any')).status).toBe(401);
  });

  it('rejects garbage, a wrong scheme, and a token signed with another secret', async () => {
    expect((await t.http.get('/api/auth/me').set(bearer('garbage'))).status).toBe(401);
    const token = await tokenFor('owner', OWNER_PASSWORD);
    expect((await t.http.get('/api/auth/me').set({ Authorization: `Basic ${token}` })).status).toBe(
      401,
    );
    const forged = await t.jwt.signAsync(
      { sub: await userId('owner') },
      { secret: 'x'.repeat(48) },
    );
    expect((await t.http.get('/api/auth/me').set(bearer(forged))).status).toBe(401);
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: await userId('owner') })}.`;
    expect((await t.http.get('/api/auth/me').set(bearer(none))).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = await t.jwt.signAsync({ sub: await userId('owner') }, { expiresIn: -10 });
    expect((await t.http.get('/api/auth/me').set(bearer(expired))).status).toBe(401);
  });

  it('returns the signed-in user for a valid token', async () => {
    const token = await tokenFor('worker', WORKER_PASSWORD);
    const res = await t.http.get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(UserSchema.parse(res.body).username).toBe('worker');
  });

  it('stops honouring a token the moment the account is deactivated', async () => {
    const token = await tokenFor('worker', WORKER_PASSWORD);
    // /probe/any has no checks of its own, so this tests the global guard alone.
    expect((await t.http.get('/api/probe/any').set(bearer(token))).status).toBe(200);
    await t.db.update(users).set({ active: false }).where(eq(users.username, 'worker'));
    try {
      expect((await t.http.get('/api/probe/any').set(bearer(token))).status).toBe(401);
      expect((await t.http.get('/api/auth/me').set(bearer(token))).status).toBe(401);
    } finally {
      await t.db.update(users).set({ active: true }).where(eq(users.username, 'worker'));
    }
  });
});

describe('role permissions (@Roles)', () => {
  it('lets any signed-in user into a route with no @Roles', async () => {
    const worker = await tokenFor('worker', WORKER_PASSWORD);
    expect((await t.http.get('/api/probe/any').set(bearer(worker))).status).toBe(200);
  });

  it('lets the owner in and keeps the worker out of an owner-only route', async () => {
    const owner = await tokenFor('owner', OWNER_PASSWORD);
    const worker = await tokenFor('worker', WORKER_PASSWORD);
    expect((await t.http.get('/api/probe/owner-only').set(bearer(owner))).status).toBe(200);
    expect((await t.http.get('/api/probe/owner-only').set(bearer(worker))).status).toBe(403);
  });

  it('uses the role in the database, not one baked into the token', async () => {
    const worker = await tokenFor('worker', WORKER_PASSWORD);
    await t.db.update(users).set({ role: 'owner' }).where(eq(users.username, 'worker'));
    try {
      expect((await t.http.get('/api/probe/owner-only').set(bearer(worker))).status).toBe(200);
    } finally {
      await t.db.update(users).set({ role: 'worker' }).where(eq(users.username, 'worker'));
    }
    expect((await t.http.get('/api/probe/owner-only').set(bearer(worker))).status).toBe(403);
  });
});
