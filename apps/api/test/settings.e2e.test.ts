import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings, users } from '@jogylink/db';
import { SETTING_DEFINITIONS, SettingSchema } from '@jogylink/shared';
import { SettingsService } from '../src/settings/settings.service';
import { bearer, createTestApp, type TestApp } from './helpers/test-app';

let t: TestApp;
let owner: string;
let worker: string;

const put = (key: string, value: unknown, token: string) =>
  t.http.put(`/api/settings/${key}`).set(bearer(token)).send({ value });

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.ownerToken();
  worker = await t.workerToken();
});
afterAll(() => t.close());

// Every test starts from the seeded defaults.
beforeEach(async () => {
  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    await t.db.update(settings).set({ value: def.default }).where(eq(settings.key, key));
  }
});

describe('GET /api/settings', () => {
  it('needs a login', async () => {
    expect((await t.http.get('/api/settings')).status).toBe(401);
  });

  it('lets a worker read every setting, with the documented defaults', async () => {
    const res = await t.http.get('/api/settings').set(bearer(worker));
    expect(res.status).toBe(200);
    const list = (res.body as unknown[]).map((s) => SettingSchema.parse(s));
    expect(list.map((s) => s.key).sort()).toEqual(Object.keys(SETTING_DEFINITIONS).sort());
    expect(list.find((s) => s.key === 'retail_markup')?.value).toBe(1.1);
    expect(list.find((s) => s.key === 'expiry_green_min_days')?.value).toBe(46);
  });
});

describe('PUT /api/settings/:key', () => {
  it('is owner-only', async () => {
    expect((await put('retail_markup', 1.2, worker)).status).toBe(403);
    expect((await t.http.put('/api/settings/retail_markup').send({ value: 1.2 })).status).toBe(401);
  });

  it('changes a value, and the next read sees it', async () => {
    const res = await put('retail_markup', 1.15, owner);
    expect(res.status).toBe(200);
    expect(SettingSchema.parse(res.body).value).toBe(1.15);

    const all = await t.http.get('/api/settings').set(bearer(worker));
    expect(all.body.find((s: { key: string }) => s.key === 'retail_markup').value).toBe(1.15);
  });

  it('records who changed it', async () => {
    await put('claim_age_trigger_days', 21, owner);
    const [row] = await t.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'claim_age_trigger_days'));
    const [ownerRow] = await t.db.select().from(users).where(eq(users.username, 'owner'));
    expect(row?.updatedBy).toBe(ownerRow?.id);
  });

  it('rejects values that break the key rules (markup below 1, wrong type, non-integer days)', async () => {
    expect((await put('retail_markup', 0.9, owner)).status).toBe(400);
    expect((await put('retail_markup', 11, owner)).status).toBe(400);
    expect((await put('retail_markup', 'high', owner)).status).toBe(400);
    expect((await put('expiry_green_min_days', 46.5, owner)).status).toBe(400);
    const res = await put('claim_value_trigger', -5, owner);
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('returns 404 for a setting that does not exist', async () => {
    expect((await put('not_a_setting', 1, owner)).status).toBe(404);
  });

  it('keeps the expiry stages in order: green > yellow > orange', async () => {
    // green (46) may not drop to or below yellow (22)
    expect((await put('expiry_green_min_days', 22, owner)).status).toBe(422);
    expect((await put('expiry_green_min_days', 10, owner)).status).toBe(422);
    // yellow may not rise to green (46) or fall to orange (8)
    expect((await put('expiry_yellow_min_days', 46, owner)).status).toBe(422);
    expect((await put('expiry_yellow_min_days', 8, owner)).status).toBe(422);
    // orange may not rise to yellow (22)
    expect((await put('expiry_orange_min_days', 22, owner)).status).toBe(422);
    // nothing was changed by the rejected requests
    const svc = t.moduleRef.get(SettingsService);
    expect(await svc.get('expiry_green_min_days')).toBe(46);
    expect(await svc.get('expiry_yellow_min_days')).toBe(22);
    expect(await svc.get('expiry_orange_min_days')).toBe(8);
  });

  it('allows a valid change to the expiry stages', async () => {
    expect((await put('expiry_green_min_days', 60, owner)).status).toBe(200);
    expect((await put('expiry_yellow_min_days', 30, owner)).status).toBe(200);
    expect((await put('expiry_orange_min_days', 10, owner)).status).toBe(200);
  });
});

describe('SettingsService (used by other modules)', () => {
  it('returns typed values', async () => {
    const svc = t.moduleRef.get(SettingsService);
    const markup: number = await svc.get('retail_markup');
    expect(markup).toBe(1.1);
  });

  it('falls back to the default when a row is missing', async () => {
    const svc = t.moduleRef.get(SettingsService);
    await t.db.delete(settings).where(eq(settings.key, 'claim_value_trigger'));
    expect(await svc.get('claim_value_trigger')).toBe(
      SETTING_DEFINITIONS.claim_value_trigger.default,
    );
    const all = await svc.getAll();
    expect(all).toHaveLength(Object.keys(SETTING_DEFINITIONS).length);
    await svc.onModuleInit(); // restores the missing row without touching the others
    expect(await t.db.select().from(settings)).toHaveLength(
      Object.keys(SETTING_DEFINITIONS).length,
    );
  });

  it('refuses to use a corrupt stored value instead of silently using a default', async () => {
    const svc = t.moduleRef.get(SettingsService);
    await t.db.update(settings).set({ value: 'garbage' }).where(eq(settings.key, 'retail_markup'));
    await expect(svc.get('retail_markup')).rejects.toBeDefined();
  });
});
