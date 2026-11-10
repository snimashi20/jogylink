import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@jogylink/db';
import { UserSchema } from '@jogylink/shared';
import { bearer, createTestApp, type TestApp } from './helpers/test-app';

let t: TestApp;
let owner: string;
let worker: string;
let ownerId: string;

const post = (body: unknown, token = owner) =>
  t.http
    .post('/api/users')
    .set(bearer(token))
    .send(body as object);
const patch = (id: string, body: unknown, token = owner) =>
  t.http
    .patch(`/api/users/${id}`)
    .set(bearer(token))
    .send(body as object);

const newUser = (over: Record<string, unknown> = {}) => ({
  name: 'Kamal Perera',
  username: 'kamal',
  password: 'kamal-pass-1',
  role: 'worker',
  ...over,
});

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.ownerToken();
  worker = await t.workerToken();
  ownerId = (await t.http.get('/api/auth/me').set(bearer(owner))).body.id;
});
afterAll(() => t.close());

describe('access', () => {
  it('needs a login, and a worker gets 403 on every users route', async () => {
    expect((await t.http.get('/api/users')).status).toBe(401);
    expect((await t.http.get('/api/users').set(bearer(worker))).status).toBe(403);
    expect((await post(newUser(), worker)).status).toBe(403);
    expect((await patch(ownerId, { name: 'x' }, worker)).status).toBe(403);
  });
});

describe('GET /api/users', () => {
  it('lists everyone and never exposes password data', async () => {
    const res = await t.http.get('/api/users').set(bearer(owner));
    expect(res.status).toBe(200);
    const list = (res.body as unknown[]).map((u) => UserSchema.parse(u));
    expect(list.map((u) => u.username).sort()).toEqual(['owner', 'worker']);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('password');
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });
});

describe('POST /api/users', () => {
  it('creates a user who can then sign in with that password', async () => {
    const res = await post(newUser());
    expect(res.status).toBe(201);
    const created = UserSchema.parse(res.body);
    expect(created).toMatchObject({ username: 'kamal', role: 'worker', active: true });
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('password');

    const signIn = await t.login('kamal', 'kamal-pass-1');
    expect(signIn.status).toBe(200);
  });

  it('stores a hash, not the password', async () => {
    await post(newUser({ username: 'hashcheck', name: 'Hash Check' }));
    const all = await t.db.select().from(users);
    const row = all.find((r) => r.username === 'hashcheck')!;
    expect(row.passwordHash).not.toBe('kamal-pass-1');
    expect(row.passwordHash.startsWith('$2')).toBe(true);
  });

  it('refuses a duplicate username with 409', async () => {
    await post(newUser({ username: 'dup', name: 'Dup One' }));
    const res = await post(newUser({ username: 'dup', name: 'Dup Two' }));
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('dup');
  });

  it('rejects bad input with 400', async () => {
    expect((await post(newUser({ password: 'short' }))).status).toBe(400);
    expect((await post(newUser({ password: 'x'.repeat(73) }))).status).toBe(400);
    expect((await post(newUser({ username: 'Has Space' }))).status).toBe(400);
    expect((await post(newUser({ role: 'admin' }))).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it('can create a second owner', async () => {
    const res = await post(newUser({ username: 'owner2', name: 'Second', role: 'owner' }));
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('owner');
  });
});

describe('PATCH /api/users/:id', () => {
  it('renames and changes the role of someone else', async () => {
    const { body } = await post(newUser({ username: 'edit1', name: 'Edit One' }));
    const res = await patch(body.id, { name: '  Edited  ', role: 'owner' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Edited', role: 'owner' });
  });

  it('resets a password: the old one stops working, the new one works', async () => {
    const { body } = await post(newUser({ username: 'reset1', name: 'Reset One' }));
    expect((await patch(body.id, { password: 'brand-new-pass' })).status).toBe(200);
    expect((await t.login('reset1', 'kamal-pass-1')).status).toBe(401);
    expect((await t.login('reset1', 'brand-new-pass')).status).toBe(200);
  });

  it('deactivating locks them out at once, even with a token they already hold', async () => {
    const { body } = await post(newUser({ username: 'fired', name: 'Fired' }));
    const token = await t.tokenFor('fired', 'kamal-pass-1');
    expect((await t.http.get('/api/auth/me').set(bearer(token))).status).toBe(200);

    expect((await patch(body.id, { active: false })).status).toBe(200);
    expect((await t.http.get('/api/auth/me').set(bearer(token))).status).toBe(401);
    expect((await t.login('fired', 'kamal-pass-1')).status).toBe(401);

    // and reactivating brings them back
    expect((await patch(body.id, { active: true })).status).toBe(200);
    expect((await t.login('fired', 'kamal-pass-1')).status).toBe(200);
  });

  it('cannot be used to change a username (it is not editable)', async () => {
    const { body } = await post(newUser({ username: 'fixed', name: 'Fixed' }));
    const res = await patch(body.id, { username: 'other', name: 'Fixed 2' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('fixed');
  });

  it('rejects an empty change, a bad value, an unknown id and a malformed id', async () => {
    const { body } = await post(newUser({ username: 'edge', name: 'Edge' }));
    expect((await patch(body.id, {})).status).toBe(400);
    expect((await patch(body.id, { role: 'admin' })).status).toBe(400);
    expect((await patch(body.id, { password: 'short' })).status).toBe(400);
    expect((await patch('00000000-0000-4000-8000-000000000000', { name: 'x' })).status).toBe(404);
    expect((await patch('not-a-uuid', { name: 'x' })).status).toBe(404);
  });
});

describe('lock-out protection', () => {
  it('stops the owner deactivating their own account', async () => {
    const res = await patch(ownerId, { active: false });
    expect(res.status).toBe(409);
    expect((await t.http.get('/api/auth/me').set(bearer(owner))).status).toBe(200);
  });

  it('stops the owner demoting themselves', async () => {
    const res = await patch(ownerId, { role: 'worker' });
    expect(res.status).toBe(409);
    expect((await t.http.get('/api/users').set(bearer(owner))).status).toBe(200);
  });

  it('still lets the owner rename themselves and change their own password', async () => {
    expect((await patch(ownerId, { name: 'Owner Renamed' })).status).toBe(200);
    expect((await patch(ownerId, { role: 'owner', name: 'Owner' })).status).toBe(200);
    expect((await patch(ownerId, { password: 'owner-pass-123' })).status).toBe(200);
  });
});
