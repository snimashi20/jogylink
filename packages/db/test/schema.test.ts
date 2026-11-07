import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { SETTING_DEFINITIONS, resolveRetailPriceCents, toCents } from '@jogylink/shared';
import { SAMPLE_PRODUCTS, products, seed, settings, users } from '../src';

// A real PostgreSQL engine running in-process, using the real migration files.
const client = new PGlite();
const db = drizzle(client);
const opts = {
  ownerPassword: 'owner-pass-123',
  workerPassword: 'worker-pass-123',
  bcryptRounds: 4,
};

async function countRows(table: typeof products | typeof settings): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../database/migrations') });
  await seed(db, opts);
});

describe('seed', () => {
  it('creates an owner and a worker with hashed passwords (never plain text)', async () => {
    const rows = await db.select().from(users);
    expect(rows.map((u) => u.role).sort()).toEqual(['owner', 'worker']);
    for (const u of rows) {
      expect(u.passwordHash).not.toContain('pass-123');
      expect(u.passwordHash.startsWith('$2')).toBe(true);
    }
    const owner = rows.find((u) => u.username === 'owner')!;
    expect(await bcrypt.compare(opts.ownerPassword, owner.passwordHash)).toBe(true);
    expect(await bcrypt.compare('wrong', owner.passwordHash)).toBe(false);
  });

  it('creates 30 products and every defined setting', async () => {
    expect(SAMPLE_PRODUCTS).toHaveLength(30);
    expect(await countRows(products)).toBe(30);
    expect(await countRows(settings)).toBe(Object.keys(SETTING_DEFINITIONS).length);
  });

  it('is idempotent: running twice creates no duplicates and keeps owner edits', async () => {
    await db.update(settings).set({ value: 1.2 }).where(eq(settings.key, 'retail_markup'));
    await seed(db, opts);
    expect(await countRows(products)).toBe(30);
    const [markup] = await db.select().from(settings).where(eq(settings.key, 'retail_markup'));
    expect(markup?.value).toBe(1.2);
    await db.update(settings).set({ value: 1.1 }).where(eq(settings.key, 'retail_markup'));
  });

  it('has the design-doc worked example: Kalu Dodol 250g, wholesale 150 -> retail 165', async () => {
    const [kd] = await db.select().from(products).where(eq(products.sku, 'KD-250'));
    expect(kd?.wholesalePrice).toBe('150.00');
    const retail = resolveRetailPriceCents({
      wholesaleCents: toCents(Number(kd?.wholesalePrice)),
      defaultMarkup: SETTING_DEFINITIONS.retail_markup.default,
    });
    expect(retail).toBe(toCents(165));
  });
});

describe('constraints', () => {
  const base = { sku: 'X-1', name: 'Test', unitType: 'piece' as const, wholesalePrice: '10.00' };

  it('rejects a duplicate SKU', async () => {
    await expect(db.insert(products).values({ ...base, sku: 'KD-250' })).rejects.toThrow();
  });

  it('rejects a negative wholesale price', async () => {
    await expect(
      db.insert(products).values({ ...base, sku: 'X-2', wholesalePrice: '-1.00' }),
    ).rejects.toThrow();
  });

  it('rejects a markup override below 1 (website must never undercut the shops)', async () => {
    await expect(
      db.insert(products).values({ ...base, sku: 'X-3', retailMarkupOverride: '0.9000' }),
    ).rejects.toThrow();
  });

  it('accepts a valid markup override', async () => {
    await db.insert(products).values({ ...base, sku: 'X-4', retailMarkupOverride: '1.2000' });
    const [row] = await db.select().from(products).where(eq(products.sku, 'X-4'));
    expect(Number(row?.retailMarkupOverride)).toBe(1.2);
  });

  it('rejects a duplicate username and an unknown role', async () => {
    await expect(
      db.insert(users).values({ name: 'x', username: 'owner', role: 'worker', passwordHash: 'h' }),
    ).rejects.toThrow();
    await expect(
      // @ts-expect-error: 'admin' is not a valid role
      db.insert(users).values({ name: 'x', username: 'u2', role: 'admin', passwordHash: 'h' }),
    ).rejects.toThrow();
  });
});
