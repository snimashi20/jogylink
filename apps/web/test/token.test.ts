import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_SECONDS } from '../lib/config';
import { secondsUntilExpiry } from '../lib/token';

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

describe('secondsUntilExpiry', () => {
  it('reads the exp claim', () => {
    const now = 1_700_000_000_000;
    expect(secondsUntilExpiry(jwt({ exp: 1_700_000_000 + 600 }), now)).toBe(600);
  });
  it('never goes below zero for an already-expired token', () => {
    expect(secondsUntilExpiry(jwt({ exp: 10 }), 1_700_000_000_000)).toBe(0);
  });
  it('falls back to the default for anything unreadable', () => {
    for (const bad of ['', 'nope', 'a.b.c', jwt({}), jwt({ exp: 'soon' })]) {
      expect(secondsUntilExpiry(bad)).toBe(DEFAULT_SESSION_SECONDS);
    }
  });
});
