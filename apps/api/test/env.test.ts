import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const GOOD = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
};

describe('loadEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(GOOD);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_EXPIRES_IN_SECONDS).toBe(12 * 60 * 60);
    expect(env.LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(env.LOGIN_LOCKOUT_SECONDS).toBe(15 * 60);
  });

  it('reads numbers from strings (process.env values are always strings)', () => {
    const env = loadEnv({ ...GOOD, PORT: '8080', LOGIN_MAX_ATTEMPTS: '3' });
    expect(env.PORT).toBe(8080);
    expect(env.LOGIN_MAX_ATTEMPTS).toBe(3);
  });

  it('refuses to start without a database url', () => {
    expect(() => loadEnv({ JWT_SECRET: GOOD.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('refuses a missing, short or placeholder JWT secret', () => {
    expect(() => loadEnv({ DATABASE_URL: GOOD.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...GOOD, JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => loadEnv({ ...GOOD, JWT_SECRET: 'change-me'.padEnd(40, 'x') })).toThrow(
      /placeholder/,
    );
  });

  it('refuses a token lifetime under one minute', () => {
    expect(() => loadEnv({ ...GOOD, JWT_EXPIRES_IN_SECONDS: '5' })).toThrow(
      /JWT_EXPIRES_IN_SECONDS/,
    );
  });
});
