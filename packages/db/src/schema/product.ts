import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const unitTypeEnum = pgEnum('unit_type', ['piece', 'weight']);

/**
 * M1 — `product`.
 * Only the WHOLESALE price is stored. Retail is derived (wholesale x markup) in code by
 * `resolveRetailPriceCents` from @jogylink/shared, so the two prices can never drift apart.
 * There is deliberately NO retail_price column.
 */
export const products = pgTable(
  'product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    unitType: unitTypeEnum('unit_type').notNull(),
    wholesalePrice: numeric('wholesale_price', { precision: 12, scale: 2 }).notNull(),
    /** null = use the system-wide retail_markup setting */
    retailMarkupOverride: numeric('retail_markup_override', { precision: 6, scale: 4 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('product_wholesale_price_non_negative', sql`${t.wholesalePrice} >= 0`),
    check(
      'product_markup_override_range',
      sql`${t.retailMarkupOverride} is null or (${t.retailMarkupOverride} >= 1 and ${t.retailMarkupOverride} <= 10)`,
    ),
  ],
);
