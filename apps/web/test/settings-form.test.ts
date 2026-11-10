import { describe, expect, it } from 'vitest';
import { checkMarkup } from '../lib/markup';
import {
  inOrder,
  parseDays,
  planExpiryUpdates,
  validateExpiry,
  type ExpiryDays,
} from '../lib/settings-form';

const days = (g: number, y: number, o: number): ExpiryDays => ({
  expiry_green_min_days: g,
  expiry_yellow_min_days: y,
  expiry_orange_min_days: o,
});

describe('checkMarkup', () => {
  it('accepts 1 to 10 with up to 4 decimals', () => {
    for (const ok of ['1', '1.10', '1.2345', '10', ' 2.5 '])
      expect(checkMarkup(ok).ok, ok).toBe(true);
    expect(checkMarkup('1.1')).toEqual({ ok: true, value: 1.1 });
  });
  it('explains each refusal', () => {
    const msg = (t: string) => {
      const r = checkMarkup(t);
      return r.ok ? '' : r.error;
    };
    expect(msg('0.9')).toMatch(/never cheaper than the shop/);
    expect(msg('11')).toMatch(/10 or less/);
    expect(msg('abc')).toMatch(/such as 1\.15/);
    expect(msg('1.23456')).toMatch(/4 decimals/);
    expect(msg('')).toMatch(/Enter a markup/);
  });
});

describe('parseDays', () => {
  it('needs a whole number of 1 or more', () => {
    expect(parseDays('46')).toBe(46);
    for (const bad of ['', '0', '-3', '4.5', 'x', '12345']) expect(parseDays(bad), bad).toBeNull();
  });
});

describe('validateExpiry', () => {
  const text = (g: string, y: string, o: string) => ({
    expiry_green_min_days: g,
    expiry_yellow_min_days: y,
    expiry_orange_min_days: o,
  });
  it('accepts stages that go green > yellow > orange', () => {
    expect(validateExpiry(text('46', '22', '8'))).toEqual({ ok: true, value: days(46, 22, 8) });
  });
  it('refuses stages out of order, with a message that says how to fix it', () => {
    for (const bad of [text('22', '46', '8'), text('46', '46', '8'), text('46', '22', '22')]) {
      const r = validateExpiry(bad);
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(Object.values(r.errors).join(' ')).toMatch(/Green must be more days than Yellow/);
    }
  });
  it('flags each field that is not a number', () => {
    const r = validateExpiry(text('', '22', 'x'));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual([
      'expiry_green_min_days',
      'expiry_orange_min_days',
    ]);
  });
});

describe('planExpiryUpdates (the API checks the order after EVERY change)', () => {
  it('has nothing to do when nothing changed', () => {
    expect(planExpiryUpdates(days(46, 22, 8), days(46, 22, 8))).toEqual([]);
  });

  it('picks the only safe order when there is just one', () => {
    // Raising: moving yellow or orange first would put them above green.
    expect(planExpiryUpdates(days(10, 5, 1), days(30, 20, 15))).toEqual([
      'expiry_green_min_days',
      'expiry_yellow_min_days',
      'expiry_orange_min_days',
    ]);
    // Lowering: moving green or yellow first would drop them below the stage under them.
    expect(planExpiryUpdates(days(30, 20, 15), days(10, 5, 1))).toEqual([
      'expiry_orange_min_days',
      'expiry_yellow_min_days',
      'expiry_green_min_days',
    ]);
  });

  it('always finds a safe order, and every in-between state is valid (checked for every case)', () => {
    const valid: ExpiryDays[] = [];
    for (let g = 3; g <= 14; g++)
      for (let y = 2; y < g; y++) for (let o = 1; o < y; o++) valid.push(days(g, y, o));

    let pairs = 0;
    for (const from of valid) {
      for (const to of valid) {
        const plan = planExpiryUpdates(from, to);
        expect(plan, `${JSON.stringify(from)} -> ${JSON.stringify(to)}`).not.toBeNull();
        let state = from;
        for (const key of plan!) {
          state = { ...state, [key]: to[key] };
          expect(inOrder(state)).toBe(true);
        }
        expect(state).toEqual(to);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(10_000);
  });
});
