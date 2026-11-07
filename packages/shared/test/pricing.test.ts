import { describe, expect, it } from 'vitest';
import { parseMarkup, resolveRetailPriceCents, retailPriceCents, toCents, fromCents } from '../src';

describe('retailPriceCents (wholesale x markup)', () => {
  it('matches the worked example in the design doc: Rs 150.00 -> Rs 165.00', () => {
    expect(retailPriceCents(toCents(150), '1.10')).toBe(toCents(165));
  });

  it('rounds half-up to the nearest cent', () => {
    // 10.05 x 1.10 = 11.055 -> 11.06
    expect(retailPriceCents(1005, '1.10')).toBe(1106);
    // 0.01 x 1.10 = 0.011 -> 0.01
    expect(retailPriceCents(1, '1.10')).toBe(1);
  });

  it('has no floating-point drift on awkward values', () => {
    // 0.1 + 0.2 style traps: 1.15 x 1.10 must be exactly 1.265 -> 1.27
    expect(retailPriceCents(115, '1.10')).toBe(127);
    expect(retailPriceCents(29_999_99, '1.10')).toBe(3_299_999);
  });

  it('accepts a number markup as well as a string', () => {
    expect(retailPriceCents(10000, 1.1)).toBe(11000);
    expect(retailPriceCents(10000, 1.25)).toBe(12500);
  });

  it('a markup of 1 gives retail equal to wholesale', () => {
    expect(retailPriceCents(15000, '1')).toBe(15000);
  });

  it('rejects a markup below 1 (website must never undercut the shops)', () => {
    expect(() => retailPriceCents(15000, '0.95')).toThrow(RangeError);
  });

  it('rejects junk markups', () => {
    expect(() => parseMarkup('abc')).toThrow(RangeError);
    expect(() => parseMarkup('1.123456')).toThrow(RangeError);
    expect(() => parseMarkup('11')).toThrow(RangeError);
  });

  it('rejects non-integer or negative cents', () => {
    expect(() => retailPriceCents(10.5, '1.10')).toThrow(RangeError);
    expect(() => retailPriceCents(-1, '1.10')).toThrow(RangeError);
  });
});

describe('resolveRetailPriceCents (per-product override)', () => {
  it('uses the system markup when there is no override', () => {
    expect(resolveRetailPriceCents({ wholesaleCents: 20000, defaultMarkup: '1.10' })).toBe(22000);
    expect(
      resolveRetailPriceCents({
        wholesaleCents: 20000,
        defaultMarkup: '1.10',
        markupOverride: null,
      }),
    ).toBe(22000);
  });

  it('uses the override when the product has one (e.g. fragile packaging)', () => {
    expect(
      resolveRetailPriceCents({
        wholesaleCents: 20000,
        defaultMarkup: '1.10',
        markupOverride: 1.2,
      }),
    ).toBe(24000);
  });
});

describe('cents helpers', () => {
  it('round-trips', () => {
    expect(toCents(150.1)).toBe(15010);
    expect(fromCents(15010)).toBe(150.1);
  });
});
