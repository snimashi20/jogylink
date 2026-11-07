import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main(): Promise<void> {
  const env = loadEnv(); // fail fast, before anything starts
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app, env);
  await app.listen(env.PORT);
  console.log(`JogyLink API listening on http://localhost:${env.PORT}/api`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
