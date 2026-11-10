import type { Role } from '@jogylink/shared';

export interface NewUserValues {
  name: string;
  username: string;
  password: string;
  role: Role;
}
export type NewUserErrors = Partial<Record<'name' | 'username' | 'password', string>>;

/** bcrypt, which hashes the passwords, reads at most 72 characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Says how to fix a password, or returns null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** Usernames are typed in any case but stored lower-case, so people never fight capital letters. */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateNewUser(
  v: NewUserValues,
):
  | { ok: true; value: { name: string; username: string; password: string; role: Role } }
  | { ok: false; errors: NewUserErrors } {
  const errors: NewUserErrors = {};
  const username = normaliseUsername(v.username);

  if (v.name.trim() === '') errors.name = "Enter the person's name.";
  if (username === '') errors.username = 'Enter a username, for example kamal.';
  else if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    errors.username =
      'Use 3 to 40 characters: letters, digits, dot, dash or underscore, with no spaces.';
  }
  const password = passwordProblem(v.password);
  if (password) errors.password = password;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name: v.name.trim(), username, password: v.password, role: v.role },
  };
}
