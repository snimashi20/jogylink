export type ExpiryKey =
  'expiry_green_min_days' | 'expiry_yellow_min_days' | 'expiry_orange_min_days';
export type ExpiryDays = Record<ExpiryKey, number>;
export type ExpiryErrors = Partial<Record<ExpiryKey, string>>;

const ORDER: ExpiryKey[] = [
  'expiry_green_min_days',
  'expiry_yellow_min_days',
  'expiry_orange_min_days',
];

/** A whole number of days, 1 or more. */
export function parseDays(text: string): number | null {
  const t = text.trim();
  return /^\d{1,4}$/.test(t) && Number(t) >= 1 ? Number(t) : null;
}

export const inOrder = (d: ExpiryDays) =>
  d.expiry_green_min_days > d.expiry_yellow_min_days &&
  d.expiry_yellow_min_days > d.expiry_orange_min_days;

export function validateExpiry(
  text: Record<ExpiryKey, string>,
): { ok: true; value: ExpiryDays } | { ok: false; errors: ExpiryErrors } {
  const errors: ExpiryErrors = {};
  const value = {} as ExpiryDays;
  for (const key of ORDER) {
    const n = parseDays(text[key]);
    if (n === null) errors[key] = 'Enter a whole number of days, 1 or more.';
    else value[key] = n;
  }
  if (Object.keys(errors).length === 0 && !inOrder(value)) {
    const message =
      'Green must be more days than Yellow, and Yellow more than Orange (for example 46, 22, 8).';
    return {
      ok: false,
      errors: { expiry_green_min_days: message, expiry_yellow_min_days: message },
    };
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * The API checks the order after EVERY single change, so saving three numbers has to happen in
 * an order where each in-between state is still valid. Returns that order for the keys that
 * changed (an empty list when nothing changed), or null if no safe order exists.
 */
export function planExpiryUpdates(current: ExpiryDays, next: ExpiryDays): ExpiryKey[] | null {
  const changed = ORDER.filter((k) => current[k] !== next[k]);
  const attempt = (state: ExpiryDays, left: ExpiryKey[]): ExpiryKey[] | null => {
    if (left.length === 0) return [];
    for (const key of left) {
      const after = { ...state, [key]: next[key] };
      if (!inOrder(after)) continue;
      const rest = attempt(
        after,
        left.filter((k) => k !== key),
      );
      if (rest) return [key, ...rest];
    }
    return null;
  };
  return attempt(current, changed);
}
