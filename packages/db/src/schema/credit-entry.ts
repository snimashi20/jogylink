import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { shops } from './shop';
import { users } from './user';

/**
 * M6 — `credit_entry`. The ledger of everything that moves what a shop owes.
 *
 * Append-only and event-shaped: a sale increases the debt, a payment and a return credit reduce
 * it, an adjustment is the owner correcting something. A balance is the SUM of these rows, never
 * a stored column — the same decision as docs/sync.md, because the van is offline for hours and
 * two stored balances would disagree.
 *
 * Rows are never updated or deleted. A mistake is corrected by posting an `adjustment`, so the
 * history stays auditable: the owner can always see what the figure was built from.
 */
export const creditEntries = pgTable(
  'credit_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    /** sale · return · payment · adjustment (CREDIT_ENTRY_KINDS in @jogylink/shared). */
    kind: text('kind').notNull(),
    /** Signed rupees: positive increases the debt, negative reduces it. */
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    /**
     * The id of the event this entry came from — a device's sale uuid, a payment uuid, a return
     * uuid. UNIQUE, which is what makes posting idempotent: a POS that uploads the same sale
     * twice, or a retried admin request, inserts nothing the second time. Without this, every
     * repeated sync would double a shop's debt.
     */
    sourceUuid: text('source_uuid').notNull().unique(),
    /** The sale this relates to, so a ledger row traces back to a receipt on A7. */
    saleUuid: text('sale_uuid'),
    /** When a credit sale falls due. Null for payments, returns and adjustments. */
    dueDate: date('due_date', { mode: 'date' }),
    /** When it happened in the van. Not the same as when the server heard about it. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    /** The worker who made the sale, or the owner who recorded the payment. */
    recordedBy: uuid('recorded_by').references(() => users.id),
    note: text('note'),
  },
  (t) => [
    check('credit_entry_kind_known', sql`${t.kind} in ('sale', 'return', 'payment', 'adjustment')`),
    // A zero movement is always a mistake, and it would clutter every statement.
    check('credit_entry_amount_non_zero', sql`${t.amount} <> 0`),
    /*
     * The direction is enforced by the database, not just by the service: a sale can only ever
     * increase a debt and a payment can only ever reduce it. A sign error here is money that
     * quietly moves the wrong way, and no screen would show anything obviously wrong.
     */
    check(
      'credit_entry_amount_matches_kind',
      sql`(${t.kind} = 'sale' and ${t.amount} > 0)
           or (${t.kind} in ('return', 'payment') and ${t.amount} < 0)
           or ${t.kind} = 'adjustment'`,
    ),
    check('credit_entry_due_date_only_on_sale', sql`${t.dueDate} is null or ${t.kind} = 'sale'`),
    index('credit_entry_shop_idx').on(t.shopId, t.occurredAt),
    index('credit_entry_due_date_idx').on(t.dueDate),
  ],
);
