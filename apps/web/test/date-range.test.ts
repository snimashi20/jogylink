import { describe, expect, it } from 'vitest';
import {
  addDays,
  customRangeProblem,
  describeRange,
  isValidDay,
  parseRange,
  rangeForPreset,
  rangeToQuery,
  todayIso,
} from '../lib/date-range';

const TODAY = '2026-11-10';

describe('date range', () => {
  it('works out "today" in the business time zone, not the server zone', () => {
    // 20:00 UTC on the 9th is already 01:30 on the 10th in Sri Lanka.
    expect(todayIso(new Date('2026-11-09T20:00:00Z'))).toBe('2026-11-10');
    expect(todayIso(new Date('2026-11-09T10:00:00Z'))).toBe('2026-11-09');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('builds the presets, both ends inclusive', () => {
    expect(rangeForPreset('today', TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    expect(rangeForPreset('7d', TODAY)).toMatchObject({ from: '2026-11-04', to: TODAY });
    expect(rangeForPreset('30d', TODAY)).toMatchObject({ from: '2026-10-12', to: TODAY });
    expect(rangeForPreset('month', TODAY)).toMatchObject({ from: '2026-11-01', to: TODAY });
  });

  it('rejects impossible dates', () => {
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('10/11/2026')).toBe(false);
    expect(isValidDay('2026-11-10')).toBe(true);
  });

  it('explains custom range problems', () => {
    expect(customRangeProblem('', '', TODAY)).toMatch(/both a start date and an end date/);
    expect(customRangeProblem('2026-11-09', '2026-11-01', TODAY)).toMatch(/on or before/);
    expect(customRangeProblem('2026-11-01', '2026-11-11', TODAY)).toMatch(/future/);
    expect(customRangeProblem('2026-11-01', TODAY, TODAY)).toBeNull();
  });

  it('reads the range from the address and never errors on junk', () => {
    expect(parseRange({ range: '7d' }, TODAY).range).toBe('7d');
    expect(parseRange({}, TODAY).range).toBe('30d');
    expect(parseRange({ range: 'nonsense' }, TODAY).range).toBe('30d');
    expect(parseRange({ range: ['today', '7d'] }, TODAY).range).toBe('today');
    expect(parseRange({ range: 'custom', from: '2026-11-01', to: '2026-11-05' }, TODAY)).toEqual({
      range: 'custom',
      from: '2026-11-01',
      to: '2026-11-05',
    });
    // A hand-edited bad custom range falls back instead of crashing.
    expect(parseRange({ range: 'custom', from: 'x', to: 'y' }, TODAY).range).toBe('30d');
    expect(parseRange({ range: 'custom', from: '2026-11-09', to: '2026-11-01' }, TODAY).range).toBe(
      '30d',
    );
  });

  it('round-trips through the query string', () => {
    const custom = { range: 'custom' as const, from: '2026-11-01', to: '2026-11-05' };
    expect(rangeToQuery(custom)).toBe('range=custom&from=2026-11-01&to=2026-11-05');
    expect(rangeToQuery(rangeForPreset('7d', TODAY))).toBe('range=7d');
  });

  it('describes ranges in words', () => {
    expect(describeRange({ range: 'today', from: TODAY, to: TODAY })).toBe('10 Nov 2026');
    expect(describeRange(rangeForPreset('7d', TODAY))).toBe('4 Nov – 10 Nov 2026');
    expect(describeRange({ range: 'custom', from: '2025-12-20', to: '2026-01-05' })).toBe(
      '20 Dec 2025 – 5 Jan 2026',
    );
  });
});
