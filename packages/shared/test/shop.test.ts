import { describe, expect, it } from 'vitest';
import { ShopCreateSchema, ShopListQuerySchema, ShopUpdateSchema } from '../src';

describe('Shop schemas', () => {
  it('requires a non-empty code and name and rejects negative credit limits', () => {
    expect(ShopCreateSchema.safeParse({ code: 'S-1', name: 'Shop', creditLimit: 0 }).success).toBe(
      true,
    );
    expect(ShopCreateSchema.safeParse({ code: '', name: 'Shop' }).success).toBe(false);
    expect(ShopCreateSchema.safeParse({ code: 'S-1', name: '  ' }).success).toBe(false);
    expect(ShopCreateSchema.safeParse({ code: 'S-1', name: 'Shop', creditLimit: -1 }).success).toBe(
      false,
    );
    expect(
      ShopCreateSchema.safeParse({ code: 'S-1', name: 'Shop', creditLimit: 1.001 }).success,
    ).toBe(false);
  });

  it('rejects empty updates and accepts valid partial updates', () => {
    expect(ShopUpdateSchema.safeParse({}).success).toBe(false);
    expect(ShopUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('parses active query strings explicitly and validates pagination', () => {
    expect(ShopListQuerySchema.parse({ active: 'true' }).active).toBe(true);
    expect(ShopListQuerySchema.parse({ active: 'false' }).active).toBe(false);
    expect(ShopListQuerySchema.parse({}).pageSize).toBe(25);
    expect(ShopListQuerySchema.safeParse({ active: 'no' }).success).toBe(false);
    expect(ShopListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ShopListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });
});
