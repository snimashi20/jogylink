import { describe, expect, it } from 'vitest';
import {
  CreateProductSchema,
  CreateUserSchema,
  MoneySchema,
  SETTING_DEFINITIONS,
  SettingKeySchema,
  parseSettingValue,
  PosProductSchema,
  WebProductSchema,
} from '../src';

describe('MoneySchema', () => {
  it('accepts up to 2 decimals, rejects 3', () => {
    expect(MoneySchema.safeParse(150.5).success).toBe(true);
    expect(MoneySchema.safeParse(150.555).success).toBe(false);
    expect(MoneySchema.safeParse(-1).success).toBe(false);
  });
});

describe('CreateProductSchema', () => {
  const base = { sku: 'KD-250', name: 'Kalu Dodol 250g', unitType: 'piece', wholesalePrice: 150 };

  it('accepts a valid product, with or without a markup override', () => {
    expect(CreateProductSchema.safeParse(base).success).toBe(true);
    expect(CreateProductSchema.safeParse({ ...base, retailMarkupOverride: 1.2 }).success).toBe(
      true,
    );
  });

  it('rejects an override below 1', () => {
    expect(CreateProductSchema.safeParse({ ...base, retailMarkupOverride: 0.9 }).success).toBe(
      false,
    );
  });

  it('does not accept a client-sent retail price (it is derived)', () => {
    const parsed = CreateProductSchema.parse({ ...base, retailPrice: 1 });
    expect('retailPrice' in parsed).toBe(false);
  });
});

describe('role-specific product views', () => {
  const full = {
    id: '3f2b8a0e-5d1c-4c57-9a52-0a1f6f1d2b11',
    sku: 'KD-250',
    name: 'Kalu Dodol 250g',
    unitType: 'piece',
    wholesalePrice: 150,
    retailMarkupOverride: null,
    retailPrice: 165,
    active: true,
  };

  it('POS view has wholesale only', () => {
    const pos = PosProductSchema.parse(full);
    expect(pos).toHaveProperty('wholesalePrice', 150);
    expect(pos).not.toHaveProperty('retailPrice');
  });

  it('website view has retail only', () => {
    const web = WebProductSchema.parse(full);
    expect(web).toHaveProperty('retailPrice', 165);
    expect(web).not.toHaveProperty('wholesalePrice');
  });
});

describe('CreateUserSchema', () => {
  it('requires a strong-enough password and a valid role', () => {
    const ok = { name: 'K. Sunil', username: 'sunil', password: 'longenough', role: 'worker' };
    expect(CreateUserSchema.safeParse(ok).success).toBe(true);
    expect(CreateUserSchema.safeParse({ ...ok, password: 'short' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ ...ok, role: 'admin' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ ...ok, username: 'Has Space' }).success).toBe(false);
  });
});

describe('settings', () => {
  it('every defined setting key is in the key enum and its default is valid', () => {
    for (const key of Object.keys(SETTING_DEFINITIONS) as (keyof typeof SETTING_DEFINITIONS)[]) {
      expect(SettingKeySchema.safeParse(key).success).toBe(true);
      expect(() => parseSettingValue(key, SETTING_DEFINITIONS[key].default)).not.toThrow();
    }
  });

  it('default markup is 1.10', () => {
    expect(SETTING_DEFINITIONS.retail_markup.default).toBe(1.1);
  });

  it('rejects a markup below 1', () => {
    expect(() => parseSettingValue('retail_markup', 0.8)).toThrow();
  });

  it('expiry thresholds are in descending order by default', () => {
    const {
      expiry_green_min_days: g,
      expiry_yellow_min_days: y,
      expiry_orange_min_days: o,
    } = SETTING_DEFINITIONS;
    expect(g.default).toBeGreaterThan(y.default);
    expect(y.default).toBeGreaterThan(o.default);
  });
});
