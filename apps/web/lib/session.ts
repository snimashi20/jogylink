import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserSchema, type User } from '@jogylink/shared';
import { API_URL, SESSION_COOKIE } from './config';

/**
 * The signed-in user, or null. The API is asked on every call (it re-reads the account), so a
 * deactivated user or a changed role takes effect immediately, not when the cookie expires.
 */
export async function getSession(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return UserSchema.parse(await res.json());
  } catch {
    return null;
  }
}

/** For pages that need someone signed in. Sends everybody else to the login screen. */
export async function requireUser(): Promise<User> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}
