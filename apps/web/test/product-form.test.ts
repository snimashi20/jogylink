import { describe, expect, it } from 'vitest';
import { formatMarkup, formatRs } from '../lib/format';
import { parseRupees, validateProductForm, type ProductFormValues } from '../lib/product-form';

const good: ProductFormValues = {
  sku: ' kd-250 ',
  name: '  Kalu Dodol 250g ',
  unitType: 'piece',
  wholesale: '1,250.5',
  markup: '',
};

describe('parseRupees', () => {
  it('accepts plain, comma and Rs-prefixed amounts', () => {
    expect(parseRupees('150')).toBe(150);
    expect(parseRupees('150.50')).toBe(150.5);
    expect(parseRupees('1,250.5')).toBe(1250.5);
    expect(parseRupees('Rs. 99')).toBe(99);
  });
  it('rejects anything that is not a clean price', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '12,5,0x', '1.', '.5']) {
      expect(parseRupees(bad), bad).toBeNull();
    }
  });
  it('does not drift on floating-point amounts', () => {
    expect(parseRupees('0.29')).toBe(0.29);
    expect(parseRupees('1.15')).toBe(1.15);
  });
});

describe('validateProductForm', () => {
  it('cleans the input and uses null for "no own markup"', () => {
    expect(validateProductForm(good)).toEqual({
      ok: true,
      value: {
        sku: 'KD-250',
        name: 'Kalu Dodol 250g',
        unitType: 'piece',
        wholesalePrice: 1250.5,
        retailMarkupOverride: null,
      },
    });
  });

  it('accepts an own markup', () => {
    const r = validateProductForm({ ...good, markup: '1.25' });
    expect(r.ok && r.value.retailMarkupOverride).toBe(1.25);
  });

  it('says how to fix each problem', () => {
    const r = validateProductForm({
      sku: '',
      name: '',
      unitType: 'piece',
      wholesale: '',
      markup: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['name', 'sku', 'wholesale']);
      expect(r.errors.sku).toMatch(/^Enter /);
    }
  });

  it('refuses a markup below 1, because the website must never be cheaper than the shop', () => {
    const r = validateProductForm({ ...good, markup: '0.9' });
    expect(!r.ok && r.errors.markup).toMatch(/never cheaper than the shop/);
  });

  it('refuses a markup above 10 and a non-number', () => {
    expect(validateProductForm({ ...good, markup: '11' }).ok).toBe(false);
    expect(validateProductForm({ ...good, markup: 'abc' }).ok).toBe(false);
    expect(validateProductForm({ ...good, markup: '1,2' }).ok).toBe(false);
  });

  it('refuses a zero or negative price', () => {
    expect(validateProductForm({ ...good, wholesale: '0' }).ok).toBe(false);
    expect(validateProductForm({ ...good, wholesale: '-5' }).ok).toBe(false);
  });
});

describe('formatting', () => {
  it('shows rupees with two decimals and thousands separators', () => {
    expect(formatRs(1250.5)).toBe('Rs 1,250.50');
    expect(formatRs(0)).toBe('Rs 0.00');
  });
  it('shows markups with two to four decimals', () => {
    expect(formatMarkup(1.1)).toBe('1.10');
    expect(formatMarkup(1)).toBe('1.00');
    expect(formatMarkup(1.25)).toBe('1.25');
    expect(formatMarkup(1.2345)).toBe('1.2345');
    expect(formatMarkup(1.234)).toBe('1.234');
  });
});
