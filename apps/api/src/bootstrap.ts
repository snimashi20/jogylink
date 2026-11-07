import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env';

/** Settings shared by the real server and the tests, so tests exercise the same setup. */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  app.enableShutdownHooks();

  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  // Behind Railway's proxy, req.ip must be the real client for login lockout to work.
  if (env.NODE_ENV === 'production') express.set('trust proxy', 1);
}
