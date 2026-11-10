/**
 * The date range shared by the dashboard (A1) and reports (A12). It lives in the page address
 * (?range=30d, or ?range=custom&from=2026-11-01&to=2026-11-09) so a page can be bookmarked,
 * shared, and survives a refresh. Dates are plain "YYYY-MM-DD" days in the business's time zone.
 */
export const BUSINESS_TIMEZONE = 'Asia/Colombo';

export const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];
export type RangeId = PresetId | 'custom';

export interface DateRange {
  range: RangeId;
  /** First day, inclusive. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

export const DEFAULT_RANGE: PresetId = '30d';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in the business time zone, so "today" is right even if the server is elsewhere. */
export function todayIso(now: Date = new Date(), timeZone: string = BUSINESS_TIMEZONE): string {
  // The en-CA locale prints YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function isValidDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: PresetId, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { range: preset, from: today, to: today };
    case '7d':
      return { range: preset, from: addDays(today, -6), to: today };
    case '30d':
      return { range: preset, from: addDays(today, -29), to: today };
    case 'month':
      return { range: preset, from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Why a custom range cannot be used, or null when it is fine. Says how to fix it. */
export function customRangeProblem(from: string, to: string, today: string): string | null {
  if (!isValidDay(from) || !isValidDay(to)) return 'Choose both a start date and an end date.';
  if (from > to) return 'The start date must be on or before the end date.';
  if (to > today) return 'The end date cannot be in the future. Choose today or earlier.';
  return null;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads the range from the address. Anything unusable falls back to the default, never errors. */
export function parseRange(params: Params, today: string): DateRange {
  const id = first(params.range);
  const preset = PRESETS.find((p) => p.id === id);
  if (preset) return rangeForPreset(preset.id, today);

  if (id === 'custom') {
    const from = first(params.from) ?? '';
    const to = first(params.to) ?? '';
    if (customRangeProblem(from, to, today) === null) return { range: 'custom', from, to };
  }
  return rangeForPreset(DEFAULT_RANGE, today);
}

/** The query string for a range, e.g. "range=30d" or "range=custom&from=…&to=…". */
export function rangeToQuery(r: DateRange): string {
  return r.range === 'custom' ? `range=custom&from=${r.from}&to=${r.to}` : `range=${r.range}`;
}

/** "9 Nov 2026" or "1 Nov – 9 Nov 2026". */
export function describeRange(r: DateRange): string {
  const fmt = (day: string, withYear: boolean) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  if (r.from === r.to) return fmt(r.from, true);
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${fmt(r.from, !sameYear)} – ${fmt(r.to, true)}`;
}
