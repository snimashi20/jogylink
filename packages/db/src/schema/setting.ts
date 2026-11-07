import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user';

/**
 * M1 — `setting`. One row per key (see SETTING_DEFINITIONS in @jogylink/shared).
 * Read by every module through M1's settings service; written only by the owner.
 */
export const settings = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
});
