import { sql } from 'drizzle-orm';
import { boolean, check, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** M4 — a retail shop and its configured wholesale credit limit. */
export const shops = pgTable(
  'shop',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    address: text('address'),
    locality: text('locality'),
    creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0.00'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('shop_credit_limit_non_negative', sql`${t.creditLimit} >= 0`)],
);
