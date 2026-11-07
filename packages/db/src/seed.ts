import bcrypt from 'bcryptjs';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { SETTING_DEFINITIONS, toCents, fromCents, type SettingKey } from '@jogylink/shared';
import { products, settings, users } from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PgDatabase<PgQueryResultHKT, any>;

/**
 * SAMPLE DATA for development and demos. Prices are placeholders, not Jogy's real price list.
 * M1's seed covers users, settings and products only. M3 owns the generator for batches,
 * shops and sales (the shared test data everyone tests against).
 */
export const SAMPLE_PRODUCTS: ReadonlyArray<{
  sku: string;
  name: string;
  unitType: 'piece' | 'weight';
  wholesale: number;
}> = [
  { sku: 'KD-250', name: 'Kalu Dodol 250g', unitType: 'piece', wholesale: 150 },
  { sku: 'KD-500', name: 'Kalu Dodol 500g', unitType: 'piece', wholesale: 290 },
  { sku: 'AL-12', name: 'Aluwa Pack 12', unitType: 'piece', wholesale: 200 },
  { sku: 'TG-100', name: 'Thala Guli 100g', unitType: 'piece', wholesale: 80 },
  { sku: 'KK-200', name: 'Kokis 200g', unitType: 'piece', wholesale: 170 },
  { sku: 'KV-10', name: 'Kavum Pack 10', unitType: 'piece', wholesale: 350 },
  { sku: 'KN-6', name: 'Konda Kavum Pack 6', unitType: 'piece', wholesale: 300 },
  { sku: 'MK-8', name: 'Mung Kavum Pack 8', unitType: 'piece', wholesale: 280 },
  { sku: 'AS-10', name: 'Aasmi Pack 10', unitType: 'piece', wholesale: 260 },
  { sku: 'AT-10', name: 'Athirasa Pack 10', unitType: 'piece', wholesale: 240 },
  { sku: 'PW-250', name: 'Pani Walalu 250g', unitType: 'piece', wholesale: 320 },
  { sku: 'WT-200', name: 'Weli Thalapa 200g', unitType: 'piece', wholesale: 210 },
  { sku: 'BB-300', name: 'Bibikkan 300g', unitType: 'piece', wholesale: 270 },
  { sku: 'PT-100', name: 'Pol Toffee 100g', unitType: 'piece', wholesale: 90 },
  { sku: 'RA-250', name: 'Rulan Aluwa 250g', unitType: 'piece', wholesale: 230 },
  { sku: 'MP-250', name: 'Mysore Pak 250g', unitType: 'piece', wholesale: 380 },
  { sku: 'JG-500', name: 'Jaggery (Hakuru) per 500g', unitType: 'weight', wholesale: 340 },
  { sku: 'PP-200', name: 'Pani Pol 200g', unitType: 'piece', wholesale: 190 },
  { sku: 'NG-150', name: 'Nelli Guli 150g', unitType: 'piece', wholesale: 120 },
  { sku: 'LD-10', name: 'Laddu Pack 10', unitType: 'piece', wholesale: 220 },
  { sku: 'KT-250', name: 'Kiri Toffee 250g', unitType: 'piece', wholesale: 260 },
  { sku: 'TA-12', name: 'Thala Aluwa Pack 12', unitType: 'piece', wholesale: 210 },
  { sku: 'CF-250', name: 'Cashew Fudge 250g', unitType: 'piece', wholesale: 450 },
  { sku: 'CR-150', name: 'Coconut Rock 150g', unitType: 'piece', wholesale: 130 },
  { sku: 'PB-200', name: 'Peanut Brittle 200g', unitType: 'piece', wholesale: 160 },
  { sku: 'WJ-300', name: 'Wood Apple Jam 300g', unitType: 'piece', wholesale: 380 },
  { sku: 'TR-375', name: 'Kithul Treacle 375ml', unitType: 'piece', wholesale: 420 },
  { sku: 'DD-100', name: 'Dodol Bites 100g', unitType: 'piece', wholesale: 85 },
  { sku: 'SM-250', name: 'Seeni Sweets Mix 250g', unitType: 'piece', wholesale: 240 },
  { sku: 'KB-1000', name: 'Kavum Family Box 1kg', unitType: 'weight', wholesale: 780 },
];

export interface SeedOptions {
  ownerPassword: string;
  workerPassword: string;
  /** bcrypt cost. 10+ for real use; tests may lower it for speed. */
  bcryptRounds?: number;
}

/** Idempotent: running it twice never creates duplicates or overwrites the owner's edits. */
export async function seed(db: Db, options: SeedOptions): Promise<void> {
  const rounds = options.bcryptRounds ?? 10;

  await db
    .insert(users)
    .values([
      {
        name: 'Owner',
        username: 'owner',
        role: 'owner',
        passwordHash: await bcrypt.hash(options.ownerPassword, rounds),
      },
      {
        name: 'Worker',
        username: 'worker',
        role: 'worker',
        passwordHash: await bcrypt.hash(options.workerPassword, rounds),
      },
    ])
    .onConflictDoNothing({ target: users.username });

  await db
    .insert(settings)
    .values(
      (Object.keys(SETTING_DEFINITIONS) as SettingKey[]).map((key) => ({
        key,
        value: SETTING_DEFINITIONS[key].default,
      })),
    )
    .onConflictDoNothing({ target: settings.key });

  await db
    .insert(products)
    .values(
      SAMPLE_PRODUCTS.map((p) => ({
        sku: p.sku,
        name: p.name,
        unitType: p.unitType,
        wholesalePrice: fromCents(toCents(p.wholesale)).toFixed(2),
      })),
    )
    .onConflictDoNothing({ target: products.sku });
}
