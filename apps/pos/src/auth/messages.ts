import type { LoginFailure } from './types';

/** Every message says what happened and what to do next. */
export const loginMessages: Record<LoginFailure, string> = {
  invalid: 'That username or password is not right. Check both and try again.',
  locked: 'Too many tries. Wait a few minutes, then try again.',
  offline:
    'No signal. Signing in needs a connection the first time. Move to where you have signal, then try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
};

export function missingFieldsReason(username: string, password: string): string | null {
  if (!username.trim() && !password) return 'Type your username and password to sign in.';
  if (!username.trim()) return 'Type your username to sign in.';
  if (!password) return 'Type your password to sign in.';
  return null;
}
