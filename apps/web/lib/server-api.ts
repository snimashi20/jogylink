import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, SESSION_COOKIE } from './config';

/**
 * GET from the API as the signed-in user (server side only). A missing or rejected login sends
 * the person to the sign-in page; anything else is a real error for the error boundary.
 */
export async function apiGet<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`The API answered ${res.status} for ${path}`);
  return parse(await res.json());
}
