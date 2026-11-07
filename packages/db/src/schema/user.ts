import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'worker']);

/**
 * M1 — `user`. The table is literally named "user" (a reserved word in PostgreSQL):
 * Drizzle quotes it automatically, but any hand-written SQL must write "user" in quotes.
 */
export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
