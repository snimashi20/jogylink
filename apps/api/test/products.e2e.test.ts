import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { products, settings } from '@jogylink/db';
import { PosProductSchema, ProductSchema, WebProductSchema } from '@jogylink/shared';
import { ProductsService } from '../src/products/products.service';
import { bearer, createTestApp, type TestApp } from './helpers/test-app';

let t: TestApp;
let owner: string;
let worker: string;

const list = (token: string) => t.http.get('/api/products').set(bearer(token));
const create = (body: object, token = owner) =>
  t.http.post('/api/products').set(bearer(token)).send(body);
const patch = (id: string, body: object, token = owner) =>
  t.http.patch(`/api/products/${id}`).set(bearer(token)).send(body);
const setMarkup = (value: number) =>
  t.db.update(settings).set({ value }).where(eq(settings.key, 'retail_markup'));

async function bySku(sku: string) {
  const res = await list(owner);
  return (res.body as { sku: string }[]).find((p) => p.sku === sku) as Record<string, unknown>;
}

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.ownerToken();
  worker = await t.workerToken();
});
afterAll(() => t.close());

describe('GET /api/products (owner: both prices side by side)', () => {
  it('is owner-only', async () => {
    expect((await t.http.get('/api/products')).status).toBe(401);
    expect((await list(worker)).status).toBe(403);
  });

  it('returns every product in the contract shape', async () => {
    const res = await list(owner);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(30);
    for (const p of res.body) ProductSchema.parse(p);
  });

  it('derives retail = wholesale x 1.10 (the design doc example: Rs 150 -> Rs 165)', async () => {
    const kd = await bySku('KD-250');
    expect(kd.wholesalePrice).toBe(150);
    expect(kd.retailPrice).toBe(165);
    expect(kd.retailMarkupOverride).toBeNull();
  });

  it('changing the markup SETTING changes every retail price at once, with no product edits', async () => {
    await setMarkup(1.2);
    try {
      const kd = await bySku('KD-250');
      expect(kd.retailPrice).toBe(180);
      expect(kd.wholesalePrice).toBe(150);
    } finally {
      await setMarkup(1.1);
    }
    expect((await bySku('KD-250')).retailPrice).toBe(165);
  });
});

describe('GET /api/products/pos (worker: wholesale only)', () => {
  it('lets a worker in, and never exposes the retail price or markup', async () => {
    const res = await t.http.get('/api/products/pos').set(bearer(worker));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(30);
    for (const p of res.body) {
      PosProductSchema.parse(p);
      expect(p).not.toHaveProperty('retailPrice');
      expect(p).not.toHaveProperty('retailMarkupOverride');
    }
    expect(JSON.stringify(res.body)).not.toMatch(/retail/i);
  });

  it('needs a login, and hides inactive products', async () => {
    expect((await t.http.get('/api/products/pos')).status).toBe(401);
    const id = (await bySku('DD-100')).id as string;
    await patch(id, { active: false });
    try {
      const res = await t.http.get('/api/products/pos').set(bearer(worker));
      expect(res.body.find((p: { sku: string }) => p.sku === 'DD-100')).toBeUndefined();
    } finally {
      await patch(id, { active: true });
    }
  });
});

describe('ProductsService.listForWeb (for the M8 website)', () => {
  it('returns retail prices only, never wholesale, and skips inactive products', async () => {
    const svc = t.moduleRef.get(ProductsService);
    const id = (await bySku('CR-150')).id as string;
    await patch(id, { active: false });
    try {
      const web = await svc.listForWeb();
      expect(web.find((p) => p.sku === 'CR-150')).toBeUndefined();
      for (const p of web) {
        WebProductSchema.parse(p);
        expect(p).not.toHaveProperty('wholesalePrice');
      }
      expect(web.find((p) => p.sku === 'KD-250')?.retailPrice).toBe(165);
    } finally {
      await patch(id, { active: true });
    }
  });
});

describe('POST /api/products', () => {
  it('is owner-only', async () => {
    const body = { sku: 'NEW-1', name: 'New', unitType: 'piece', wholesalePrice: 100 };
    expect((await create(body, worker)).status).toBe(403);
  });

  it('creates a product and returns both prices', async () => {
    const res = await create({
      sku: ' new-1 ',
      name: ' Test Sweet ',
      unitType: 'piece',
      wholesalePrice: 100,
    });
    expect(res.status).toBe(201);
    const p = ProductSchema.parse(res.body);
    expect(p.sku).toBe('NEW-1'); // trimmed and upper-cased
    expect(p.name).toBe('Test Sweet');
    expect(p.wholesalePrice).toBe(100);
    expect(p.retailPrice).toBe(110);
    expect(p.active).toBe(true);
  });

  it('rounds the retail price half-up to the cent (Rs 0.05 x 1.10 = 0.055 -> 0.06)', async () => {
    const res = await create({
      sku: 'TINY-1',
      name: 'Tiny',
      unitType: 'piece',
      wholesalePrice: 0.05,
    });
    expect(res.body.retailPrice).toBe(0.06);
  });

  it('uses the per-product markup override instead of the system markup', async () => {
    const res = await create({
      sku: 'FRAGILE-1',
      name: 'Fragile',
      unitType: 'piece',
      wholesalePrice: 200,
      retailMarkupOverride: 1.5,
    });
    expect(res.body.retailPrice).toBe(300);
    await setMarkup(1.3);
    try {
      expect((await bySku('FRAGILE-1')).retailPrice).toBe(300); // override ignores the setting
      expect((await bySku('NEW-1')).retailPrice).toBe(130); // no override: follows the setting
    } finally {
      await setMarkup(1.1);
    }
  });

  it('rejects a duplicate SKU with 409, whatever the letter case', async () => {
    const res = await create({ sku: 'kd-250', name: 'Dup', unitType: 'piece', wholesalePrice: 1 });
    expect(res.status).toBe(409);
  });

  it('rejects bad input with 400', async () => {
    const ok = { sku: 'BAD-1', name: 'Bad', unitType: 'piece', wholesalePrice: 10 };
    expect((await create({ ...ok, wholesalePrice: -1 })).status).toBe(400);
    expect((await create({ ...ok, wholesalePrice: 10.555 })).status).toBe(400);
    expect((await create({ ...ok, unitType: 'litre' })).status).toBe(400);
    expect((await create({ ...ok, name: '' })).status).toBe(400);
    expect((await create({ ...ok, retailMarkupOverride: 0.9 })).status).toBe(400); // cheaper than shop
    expect((await create({ ...ok, retailMarkupOverride: 11 })).status).toBe(400);
    expect((await create({ ...ok, retailMarkupOverride: 1.23456 })).status).toBe(400);
    const none = await t.db.select().from(products).where(eq(products.sku, 'BAD-1'));
    expect(none).toHaveLength(0);
  });
});

describe('PATCH /api/products/:id', () => {
  it('is owner-only', async () => {
    const id = (await bySku('KD-250')).id as string;
    expect((await patch(id, { name: 'x' }, worker)).status).toBe(403);
  });

  it('updates the wholesale price and the retail price follows', async () => {
    const id = (await bySku('AL-12')).id as string;
    const before = (await bySku('AL-12')).wholesalePrice as number;
    const res = await patch(id, { wholesalePrice: 250 });
    expect(res.status).toBe(200);
    expect(res.body.wholesalePrice).toBe(250);
    expect(res.body.retailPrice).toBe(275);
    await patch(id, { wholesalePrice: before });
  });

  it('can set an override and clear it again with null', async () => {
    const id = (await bySku('TG-100')).id as string;
    expect((await patch(id, { retailMarkupOverride: 2 })).body.retailPrice).toBe(160);
    const cleared = await patch(id, { retailMarkupOverride: null });
    expect(cleared.body.retailMarkupOverride).toBeNull();
    expect(cleared.body.retailPrice).toBe(88);
  });

  it('switches a product off and on without deleting it', async () => {
    const id = (await bySku('PT-100')).id as string;
    expect((await patch(id, { active: false })).body.active).toBe(false);
    expect((await bySku('PT-100')).active).toBe(false); // owner still sees it
    expect((await patch(id, { active: true })).body.active).toBe(true);
  });

  it('refuses to rename a SKU onto an existing one', async () => {
    const id = (await bySku('PT-100')).id as string;
    expect((await patch(id, { sku: 'kd-250' })).status).toBe(409);
  });

  it('returns the product unchanged for an empty update, 404 for an unknown id, 400 for a bad id', async () => {
    const id = (await bySku('KD-250')).id as string;
    expect((await patch(id, {})).status).toBe(200);
    expect((await patch('11111111-1111-4111-8111-111111111111', { name: 'x' })).status).toBe(404);
    expect((await patch('not-a-uuid', { name: 'x' })).status).toBe(400);
    expect((await patch(id, { wholesalePrice: -5 })).status).toBe(400);
  });

  it('has no DELETE route (products are switched off, never removed)', async () => {
    const id = (await bySku('KD-250')).id as string;
    expect((await t.http.delete(`/api/products/${id}`).set(bearer(owner))).status).toBe(404);
  });
});
