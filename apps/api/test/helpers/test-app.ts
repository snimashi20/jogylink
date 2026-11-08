import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { expect } from 'vitest';
import { seed } from '@jogylink/db';
import { AppModule } from '../../src/app.module';
import { LoginAttemptLimiter } from '../../src/auth/login-attempt-limiter';
import { configureApp } from '../../src/bootstrap';
import { APP_ENV, loadEnv } from '../../src/config/env';
import { DB, DB_POOL } from '../../src/db/db.module';

export const OWNER_PASSWORD = 'owner-pass-123';
export const WORKER_PASSWORD = 'worker-pass-123';

export const testEnv = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  JWT_SECRET: 'test-secret-'.padEnd(48, 'x'),
  LOGIN_MAX_ATTEMPTS: '3',
});

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * The whole API running in-process on a REAL PostgreSQL engine (PGlite), built from the real
 * migration files and the real seed. Each call gets its own empty database.
 */
export async function createTestApp(options: { controllers?: Type<unknown>[] } = {}) {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../../../database/migrations'),
  });
  await seed(db, {
    ownerPassword: OWNER_PASSWORD,
    workerPassword: WORKER_PASSWORD,
    bcryptRounds: 4,
  });

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(APP_ENV)
    .useValue(testEnv)
    .overrideProvider(DB_POOL)
    .useValue({ end: async () => undefined })
    .overrideProvider(DB)
    .useValue(db)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  configureApp(app, testEnv);
  await app.init();

  const http = request(app.getHttpServer());

  const login = (username: string, password: string) =>
    http.post('/api/auth/login').send({ username, password });

  const tokenFor = async (username: string, password: string): Promise<string> => {
    const res = await login(username, password);
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  };

  return {
    app,
    db,
    http,
    moduleRef,
    jwt: moduleRef.get(JwtService),
    limiter: moduleRef.get(LoginAttemptLimiter),
    login,
    ownerToken: () => tokenFor('owner', OWNER_PASSWORD),
    workerToken: () => tokenFor('worker', WORKER_PASSWORD),
    tokenFor,
    close: async () => {
      await app.close();
      await client.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
