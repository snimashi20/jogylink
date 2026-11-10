import { describe, expect, it } from 'vitest';
import { normaliseUsername, passwordProblem, validateNewUser } from '../lib/user-form';

const good = {
  name: ' Kamal Perera ',
  username: ' Kamal ',
  password: 'kamal-pass-1',
  role: 'worker' as const,
};

describe('validateNewUser', () => {
  it('trims, lower-cases the username and keeps the password exactly as typed', () => {
    expect(validateNewUser({ ...good, password: ' spaced pass ' })).toEqual({
      ok: true,
      value: { name: 'Kamal Perera', username: 'kamal', password: ' spaced pass ', role: 'worker' },
    });
  });

  it('says how to fix each problem', () => {
    const r = validateNewUser({ name: '', username: '', password: '', role: 'worker' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['name', 'password', 'username']);
  });

  it('refuses usernames that are too short, too long or contain spaces or symbols', () => {
    for (const bad of ['ab', 'a'.repeat(41), 'has space', 'ka@mal', 'කමල්']) {
      expect(validateNewUser({ ...good, username: bad }).ok, bad).toBe(false);
    }
    for (const fine of ['abc', 'k.perera', 'k_p-1', 'a'.repeat(40)]) {
      expect(validateNewUser({ ...good, username: fine }).ok, fine).toBe(true);
    }
  });
});

describe('passwordProblem', () => {
  it('needs 8 to 72 characters', () => {
    expect(passwordProblem('1234567')).toMatch(/at least 8/);
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('x'.repeat(72))).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toMatch(/at most 72/);
  });
});

describe('normaliseUsername', () => {
  it('matches what the API stores', () => {
    expect(normaliseUsername('  KaMal ')).toBe('kamal');
  });
});
