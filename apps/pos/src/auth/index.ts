import { API_URL } from '../config';
import { createAuthApi } from './api';
import { AuthController } from './controller';
import { secureSessionStorage } from './storage';

/** The one controller for the whole app. Screens use `useAuth()`; other code can import this. */
export const auth = new AuthController({
  storage: secureSessionStorage,
  api: createAuthApi(API_URL),
  // M6: replace with a check for sales that are saved on the phone but not yet sent.
  guardSignOut: async () => null,
});

/**
 * fetch() for the JogyLink API with the login added. If the server answers 401 the session is
 * over, so the app returns to the sign-in screen. A network failure is NOT an auth problem and
 * is rethrown for the caller (usually M6's sync) to handle.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = auth.getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) await auth.handleUnauthorized();
  return res;
}
