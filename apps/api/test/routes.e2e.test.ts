import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routes, seed, shops } from '@jogylink/db';
import { RouteDetailResponseSchema, RouteListResponseSchema } from '@jogylink/shared';
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

async function createRoute(code: string, name = code) {
  const response = await http.post('/api/routes').set(auth(ownerToken)).send({ code, name });
  expect(response.status).toBe(201);
  return response.body as { id: string; code: string; name: string };
}

async function createShop(code: string, name = code) {
  const response = await http.post('/api/shops').set(auth(ownerToken)).send({ code, name });
  expect(response.status).toBe(201);
  return response.body as { id: string; code: string; name: string };
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
  await db.delete(routes);
});

afterAll(async () => {
  await app?.close();
  await client.close();
});

describe('Route API', () => {
  it('allows authenticated reads and restricts route changes to owners', async () => {
    expect((await http.get('/api/routes')).status).toBe(401);
    expect((await http.post('/api/routes').send({ code: 'R-1', name: 'One' })).status).toBe(401);
    expect((await http.get('/api/routes').set(auth(workerToken))).status).toBe(200);
    expect(
      (await http.post('/api/routes').set(auth(workerToken)).send({ code: 'R-1', name: 'One' }))
        .status,
    ).toBe(403);
  });

  it('creates, searches, paginates, and updates routes', async () => {
    const route = await createRoute('R-1', 'North Route');
    await createRoute('R-2', 'South Route');

    const search = await http
      .get('/api/routes')
      .query({ query: 'North', active: 'true' })
      .set(auth(workerToken));
    expect(RouteListResponseSchema.parse(search.body).items.map((item) => item.id)).toEqual([
      route.id,
    ]);

    const page = await http
      .get('/api/routes')
      .query({ page: '1', pageSize: '1' })
      .set(auth(workerToken));
    expect(RouteListResponseSchema.parse(page.body)).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
    });

    const updated = await http
      .patch(`/api/routes/${route.id}`)
      .set(auth(ownerToken))
      .send({ description: 'North district', isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ description: 'North district', isActive: false });
    expect(
      (await http.get('/api/routes').query({ active: 'false' }).set(auth(workerToken))).body.total,
    ).toBe(1);
  });

  it('rejects duplicate route codes, invalid fields, empty updates, and missing routes', async () => {
    const route = await createRoute('R-1', 'North Route');
    expect(
      (
        await http
          .post('/api/routes')
          .set(auth(ownerToken))
          .send({ code: 'R-1', name: 'Duplicate' })
      ).status,
    ).toBe(409);
    expect(
      (await http.post('/api/routes').set(auth(ownerToken)).send({ code: ' ', name: 'Invalid' }))
        .status,
    ).toBe(400);
    expect(
      (await http.patch(`/api/routes/${route.id}`).set(auth(ownerToken)).send({})).status,
    ).toBe(400);
    expect(
      (
        await http
          .patch('/api/routes/00000000-0000-4000-8000-000000000001')
          .set(auth(ownerToken))
          .send({ name: 'X' })
      ).status,
    ).toBe(404);
  });

  it('replaces ordered membership atomically and moves reassigned shops from their prior route', async () => {
    const first = await createRoute('R-1', 'North Route');
    const second = await createRoute('R-2', 'South Route');
    const shopA = await createShop('S-1', 'Shop A');
    const shopB = await createShop('S-2', 'Shop B');
    const shopC = await createShop('S-3', 'Shop C');

    const firstAssignment = await http
      .put(`/api/routes/${first.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [shopB.id, shopA.id] });
    const firstDetail = RouteDetailResponseSchema.parse(firstAssignment.body);
    expect(firstDetail.shops.map((shop) => [shop.id, shop.visitOrder])).toEqual([
      [shopB.id, 1],
      [shopA.id, 2],
    ]);

    const reordered = await http
      .put(`/api/routes/${first.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [shopA.id, shopB.id] });
    expect(
      RouteDetailResponseSchema.parse(reordered.body).shops.map((shop) => [
        shop.id,
        shop.visitOrder,
      ]),
    ).toEqual([
      [shopA.id, 1],
      [shopB.id, 2],
    ]);

    const secondAssignment = await http
      .put(`/api/routes/${second.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [shopA.id, shopC.id] });
    const secondDetail = RouteDetailResponseSchema.parse(secondAssignment.body);
    expect(secondDetail.shops.map((shop) => [shop.id, shop.visitOrder])).toEqual([
      [shopA.id, 1],
      [shopC.id, 2],
    ]);

    const firstAfterMove = await http.get(`/api/routes/${first.id}`).set(auth(workerToken));
    expect(
      RouteDetailResponseSchema.parse(firstAfterMove.body).shops.map((shop) => shop.id),
    ).toEqual([shopB.id]);

    const cleared = await http
      .put(`/api/routes/${second.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [] });
    expect(RouteDetailResponseSchema.parse(cleared.body).shops).toEqual([]);
    const shopsAfterClear = await http.get('/api/shops').set(auth(workerToken));
    expect(
      shopsAfterClear.body.items.find((shop: { id: string }) => shop.id === shopA.id),
    ).toMatchObject({
      routeId: null,
      visitOrder: null,
    });
  });

  it('rejects duplicate, missing, inactive shops and inactive target routes', async () => {
    const route = await createRoute('R-1');
    const inactiveRoute = await createRoute('R-2');
    const activeShop = await createShop('S-1');
    const inactiveShop = await createShop('S-2');
    await http
      .patch(`/api/shops/${inactiveShop.id}`)
      .set(auth(ownerToken))
      .send({ isActive: false });
    await http
      .patch(`/api/routes/${inactiveRoute.id}`)
      .set(auth(ownerToken))
      .send({ isActive: false });

    const duplicate = await http
      .put(`/api/routes/${route.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [activeShop.id, activeShop.id] });
    expect(duplicate.status).toBe(400);

    const missing = await http
      .put(`/api/routes/${route.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: ['00000000-0000-4000-8000-000000000001'] });
    expect(missing.status).toBe(404);

    await http
      .put(`/api/routes/${route.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [activeShop.id] });
    const incompleteReplacement = await http
      .put(`/api/routes/${route.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [activeShop.id, '00000000-0000-4000-8000-000000000001'] });
    expect(incompleteReplacement.status).toBe(404);
    const membershipAfterFailure = await http.get(`/api/routes/${route.id}`).set(auth(workerToken));
    expect(
      RouteDetailResponseSchema.parse(membershipAfterFailure.body).shops.map((shop) => shop.id),
    ).toEqual([activeShop.id]);

    const inactive = await http
      .put(`/api/routes/${route.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [inactiveShop.id] });
    expect(inactive.status).toBe(409);

    const disabledTarget = await http
      .put(`/api/routes/${inactiveRoute.id}/shops`)
      .set(auth(ownerToken))
      .send({ shopIds: [activeShop.id] });
    expect(disabledTarget.status).toBe(409);
  });
});
