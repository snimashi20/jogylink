import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { routes } from './route';

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
    routeId: uuid('route_id').references(() => routes.id),
    visitOrder: integer('visit_order'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('shop_credit_limit_non_negative', sql`${t.creditLimit} >= 0`),
    check('shop_visit_order_positive', sql`${t.visitOrder} is null or ${t.visitOrder} > 0`),
    check(
      'shop_route_assignment_consistent',
      sql`(${t.routeId} is null) = (${t.visitOrder} is null)`,
    ),
    index('shop_route_id_idx').on(t.routeId),
    uniqueIndex('shop_route_visit_order_unique')
      .on(t.routeId, t.visitOrder)
      .where(sql`${t.routeId} is not null and ${t.visitOrder} is not null`),
  ],
);
