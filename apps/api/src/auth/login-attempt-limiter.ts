import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { APP_ENV, type Env } from '../config/env';

interface Entry {
  failures: number;
  lockedUntil: number;
}

/**
 * Brute-force protection for the login endpoint.
 * Counts consecutive wrong passwords per (IP + username). After LOGIN_MAX_ATTEMPTS the pair is
 * locked for LOGIN_LOCKOUT_SECONDS. Keyed on IP too, so a stranger cannot lock the owner out.
 * State is in memory: fine for the single API instance this project runs.
 */
@Injectable()
export class LoginAttemptLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  /** Throws 429 if this pair is currently locked. */
  assertAllowed(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    const current = Date.now();
    if (entry.lockedUntil > current) {
      const retryAfter = Math.ceil((entry.lockedUntil - current) / 1000);
      throw new HttpException(
        { message: 'Too many failed attempts. Try again later.', retryAfterSeconds: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (entry.lockedUntil !== 0) this.entries.delete(key); // lock expired: start fresh
  }

  recordFailure(key: string): void {
    this.sweep();
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.env.LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + this.env.LOGIN_LOCKOUT_SECONDS * 1000;
    }
    this.entries.set(key, entry);
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Drops expired locks so the map cannot grow forever. */
  private sweep(): void {
    const current = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil !== 0 && entry.lockedUntil <= current) this.entries.delete(key);
    }
  }
}
