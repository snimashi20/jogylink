import { LoginResponseSchema, UserSchema } from '@jogylink/shared';
import type { AuthApi, CheckResult, LoginResult } from './types';

/** The real server calls. `fetchImpl` is injectable so tests need no network. */
export function createAuthApi(baseUrl: string, fetchImpl: typeof fetch = fetch): AuthApi {
  return {
    async login(username, password): Promise<LoginResult> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
      } catch {
        return { ok: false, reason: 'offline' };
      }
      if (res.status === 401) return { ok: false, reason: 'invalid' };
      if (res.status === 429) return { ok: false, reason: 'locked' };
      if (!res.ok) return { ok: false, reason: 'server' };

      const parsed = LoginResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return { ok: false, reason: 'server' };
      return { ok: true, token: parsed.data.accessToken, user: parsed.data.user };
    },

    async check(token): Promise<CheckResult> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        return { kind: 'offline' };
      }
      if (res.status === 401) return { kind: 'rejected' };
      // Any other failure (server down, 5xx) says nothing about the login: keep working.
      if (!res.ok) return { kind: 'offline' };
      const user = UserSchema.safeParse(await res.json().catch(() => null));
      return user.success ? { kind: 'valid', user: user.data } : { kind: 'offline' };
    },
  };
}
