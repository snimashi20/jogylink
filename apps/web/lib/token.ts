import { DEFAULT_SESSION_SECONDS } from './config';

/**
 * Seconds until a JWT expires, read from its `exp` claim, so the cookie lives exactly as long as
 * the token. This does NOT verify the token (only the API can); it only sizes the cookie.
 */
export function secondsUntilExpiry(token: string, now: number = Date.now()): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return DEFAULT_SESSION_SECONDS;
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    if (typeof exp !== 'number') return DEFAULT_SESSION_SECONDS;
    return Math.max(0, Math.floor(exp - now / 1000));
  } catch {
    return DEFAULT_SESSION_SECONDS;
  }
}
