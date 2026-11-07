import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed, shops } from '@jogylink/db';
import { ShopListResponseSchema, ShopResponseSchema } from '@jogylink/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { APP_ENV, loadEnv } from '../src/config/env';
import { DB, DB_POOL } from '../src/db/db.module';

const OWNER_PASSWORD = 'owner-pass-123';
const WORKER_PASSWORD = 'worker-pass-123';
const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  JWT_SECRET: 'test-secret-'.padEnd(48, 'x'),
});
const client = new PGlite();
const db = drizzle(client);
let app: INestApplication;
let http: ReturnType<typeof request>;
let ownerToken: string;
let workerToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(username: string, password: string): Promise<string> {
  const response = await http.post('/api/auth/login').send({ username, password });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../database/migrations') });
  await seed(db, {
    ownerPassword: OWNER_PASSWORD,
    workerPassword: WORKER_PASSWORD,
    bcryptRounds: 4,
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENV)
    .useValue(env)
    .overrideProvider(DB_POOL)
    .useValue({ end: async () => undefined })
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  http = request(app.getHttpServer());
  ownerToken = await login('owner', OWNER_PASSWORD);
  workerToken = await login('worker', WORKER_PASSWORD);
});

beforeEach(async () => {
  await db.delete(shops);
});

afterAll(async () => {
  await app?.close();
  await client.close();
});

describe('Shop API', () => {
  it('requires authentication and restricts writes to the owner', async () => {
    expect((await http.get('/api/shops')).status).toBe(401);
    expect((await http.post('/api/shops').send({ code: 'S-1', name: 'One' })).status).toBe(401);
    expect(
      (await http.post('/api/shops').set(auth(workerToken)).send({ code: 'S-1', name: 'One' }))
        .status,
    ).toBe(403);
    expect((await http.get('/api/shops').set(auth(workerToken))).status).toBe(200);
  });

  it('creates, retrieves, and updates a shop', async () => {
    const created = await http
      .post('/api/shops')
      .set(auth(ownerToken))
      .send({ code: 'S-1', name: 'Sunrise', creditLimit: 1200.5 });
    expect(created.status).toBe(201);
    const shop = ShopResponseSchema.parse(created.body);
    expect(shop.creditLimit).toBe(1200.5);

    const fetched = await http.get(`/api/shops/${shop.id}`).set(auth(workerToken));
    expect(ShopResponseSchema.parse(fetched.body).name).toBe('Sunrise');

    const updated = await http
      .patch(`/api/shops/${shop.id}`)
      .set(auth(ownerToken))
      .send({ name: 'Sunrise Market', creditLimit: 1500 });
    expect(updated.status).toBe(200);
    expect(ShopResponseSchema.parse(updated.body)).toMatchObject({
      name: 'Sunrise Market',
      creditLimit: 1500,
    });
  });

  it('rejects duplicate codes, negative limits, and empty updates', async () => {
    await http.post('/api/shops').set(auth(ownerToken)).send({ code: 'S-1', name: 'One' });
    expect(
      (await http.post('/api/shops').set(auth(ownerToken)).send({ code: 'S-1', name: 'Duplicate' }))
        .status,
    ).toBe(409);
    expect(
      (
        await http
          .post('/api/shops')
          .set(auth(ownerToken))
          .send({ code: 'S-2', name: 'Negative', creditLimit: -1 })
      ).status,
    ).toBe(400);

    const shop = await http
      .post('/api/shops')
      .set(auth(ownerToken))
      .send({ code: 'S-3', name: 'Three' });
    expect(
      (await http.patch(`/api/shops/${shop.body.id}`).set(auth(ownerToken)).send({})).status,
    ).toBe(400);
  });

  it('searches by code or name, filters false correctly, and paginates', async () => {
    await http.post('/api/shops').set(auth(ownerToken)).send({ code: 'N-1', name: 'North Shop' });
    const inactive = await http
      .post('/api/shops')
      .set(auth(ownerToken))
      .send({ code: 'S-2', name: 'South Shop' });
    await http
      .patch(`/api/shops/${inactive.body.id}`)
      .set(auth(ownerToken))
      .send({ isActive: false });

    const search = await http.get('/api/shops').query({ query: 'North' }).set(auth(workerToken));
    expect(ShopListResponseSchema.parse(search.body).items.map((shop) => shop.code)).toEqual([
      'N-1',
    ]);

    const inactiveOnly = await http
      .get('/api/shops')
      .query({ active: 'false', page: '1', pageSize: '1' })
      .set(auth(workerToken));
    const parsed = ShopListResponseSchema.parse(inactiveOnly.body);
    expect(parsed.total).toBe(1);
    expect(parsed.items[0]?.isActive).toBe(false);
    expect(parsed.pageSize).toBe(1);
  });

  it('returns 404 for missing shops and rejects malformed IDs', async () => {
    expect(
      (await http.get('/api/shops/00000000-0000-4000-8000-000000000001').set(auth(ownerToken)))
        .status,
    ).toBe(404);
    expect((await http.get('/api/shops/not-a-uuid').set(auth(ownerToken))).status).toBe(400);
  });
});
