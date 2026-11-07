import { Cents } from './money';

/**
 * The two-price rule (docs/blueprint, Solution Design section 2):
 *   - WHOLESALE price is stored (entered by the owner) and charged on the POS.
 *   - RETAIL price is DERIVED = wholesale x markup, charged on the website.
 *
 * This is the ONE place that rule lives. POS, API and website must all call it,
 * so the two prices can never drift or differ by a cent.
 *
 * Rounding: half-up to the nearest cent, done in integer arithmetic.
 */

export const DEFAULT_RETAIL_MARKUP = '1.10';

const MARKUP_SCALE = 10_000; // markup is held as ten-thousandths (1.10 -> 11000)
const MARKUP_PATTERN = /^\d{1,2}(\.\d{1,4})?$/;

/** Markup must be at least 1.0 (the website is never cheaper than the shop) and at most 10. */
export function parseMarkup(markup: number | string): number {
  const text = typeof markup === 'number' ? markup.toFixed(4) : markup.trim();
  if (!MARKUP_PATTERN.test(text)) {
    throw new RangeError(`Invalid markup "${markup}": use a decimal like 1.10 (max 4 decimals)`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  const scaled = Number(whole) * MARKUP_SCALE + Number(fraction.padEnd(4, '0'));
  if (scaled < MARKUP_SCALE) {
    throw new RangeError(
      `Invalid markup "${markup}": retail can never be below wholesale (min 1.0)`,
    );
  }
  if (scaled > 10 * MARKUP_SCALE) {
    throw new RangeError(`Invalid markup "${markup}": maximum is 10.0`);
  }
  return scaled;
}

/** retail = wholesale x markup, rounded half-up to the cent. */
export function retailPriceCents(wholesaleCents: Cents, markup: number | string): Cents {
  if (!Number.isInteger(wholesaleCents) || wholesaleCents < 0) {
    throw new RangeError('wholesaleCents must be a non-negative integer');
  }
  const scaled = parseMarkup(markup);
  return Math.floor((wholesaleCents * scaled + MARKUP_SCALE / 2) / MARKUP_SCALE);
}

/** Uses the product's own markup when it has one, otherwise the system-wide markup. */
export function resolveRetailPriceCents(input: {
  wholesaleCents: Cents;
  defaultMarkup: number | string;
  markupOverride?: number | string | null;
}): Cents {
  const markup = input.markupOverride ?? input.defaultMarkup;
  return retailPriceCents(input.wholesaleCents, markup);
}
