import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** M4 — a reusable route definition. A dated execution is a separate future concern. */
export const routes = pgTable('route', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
