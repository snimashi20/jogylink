import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { LoginAttemptLimiter } from '../src/auth/login-attempt-limiter';
import { loadEnv } from '../src/config/env';

const env = loadEnv({
  DATABASE_URL: 'postgresql://unused',
  JWT_SECRET: 'a'.repeat(40),
  LOGIN_MAX_ATTEMPTS: '3',
  LOGIN_LOCKOUT_SECONDS: '60',
});

function status(fn: () => void): number | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1;
  }
}

describe('LoginAttemptLimiter', () => {
  let limiter: LoginAttemptLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T08:00:00Z'));
    limiter = new LoginAttemptLimiter(env);
  });
  afterEach(() => vi.useRealTimers());

  it('allows attempts below the limit', () => {
    limiter.recordFailure('ip|owner');
    limiter.recordFailure('ip|owner');
    expect(status(() => limiter.assertAllowed('ip|owner'))).toBeNull();
  });

  it('locks with 429 once the limit is reached', () => {
    for (let i = 0; i < 3; i++) limiter.recordFailure('ip|owner');
    expect(status(() => limiter.assertAllowed('ip|owner'))).toBe(429);
  });

  it('does not lock other users or other IPs', () => {
    for (let i = 0; i < 3; i++) limiter.recordFailure('ip|owner');
    expect(status(() => limiter.assertAllowed('ip|worker'))).toBeNull();
    expect(status(() => limiter.assertAllowed('other-ip|owner'))).toBeNull();
  });

  it('unlocks after the lockout period and starts counting again from zero', () => {
    for (let i = 0; i < 3; i++) limiter.recordFailure('ip|owner');
    vi.advanceTimersByTime(61_000);
    expect(status(() => limiter.assertAllowed('ip|owner'))).toBeNull();
    limiter.recordFailure('ip|owner');
    expect(status(() => limiter.assertAllowed('ip|owner'))).toBeNull();
  });

  it('a successful login clears the count', () => {
    limiter.recordFailure('ip|owner');
    limiter.recordFailure('ip|owner');
    limiter.recordSuccess('ip|owner');
    limiter.recordFailure('ip|owner');
    expect(status(() => limiter.assertAllowed('ip|owner'))).toBeNull();
  });
});
