import { z } from 'zod';
import type { Cents } from './money';

/**
 * The credit ledger (M6) — the rules for what a shop owes.
 *
 * ## The ledger is a list of events, never a stored balance
 *
 * Every row is a signed movement against one shop: a sale increases what it owes, a payment and
 * a return credit reduce it. A balance is the sum of those movements, derived on read.
 *
 * This is the same decision as docs/sync.md and for the same reason: the van is offline for
 * hours, so two places could hold a "current balance" and disagree. Neither the device nor the
 * server owns the number — the events do, and they are facts that already happened.
 *
 * ## Arithmetic is integer cents
 *
 * Every function here takes and returns `Cents`. Money on the wire stays a rupee number with two
 * decimals (`MoneySchema`), converted at the API boundary. A balance that drifts by a cent per
 * sale across 300 shops is money the owner cannot find, so there is no float arithmetic here.
 */

/** What a ledger row can be. The kind fixes the direction of the amount. */
export const CREDIT_ENTRY_KINDS = ['sale', 'return', 'payment', 'adjustment'] as const;
export const CreditEntryKindSchema = z.enum(CREDIT_ENTRY_KINDS);
export type CreditEntryKind = z.infer<typeof CreditEntryKindSchema>;

/**
 * A ledger amount, which unlike `MoneySchema` may be negative: that is how a payment is written
 * down. Two decimals at most, like every other money value on the wire.
 */
export const LedgerAmountSchema = z
  .number()
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'A ledger amount can have at most 2 decimal places',
  });

/**
 * Which way each kind moves the balance. A sale is the only thing that increases what a shop
 * owes; an adjustment is the owner correcting something and may go either way.
 */
export function expectedSign(kind: CreditEntryKind): 1 | -1 | 0 {
  switch (kind) {
    case 'sale':
      return 1;
    case 'return':
    case 'payment':
      return -1;
    case 'adjustment':
      return 0; // either direction, but never zero
  }
}

/** Checks an amount against its kind, so a payment can never be stored as a debt. */
export function isValidEntryAmount(kind: CreditEntryKind, amountCents: Cents): boolean {
  if (!Number.isInteger(amountCents) || amountCents === 0) return false;
  const sign = expectedSign(kind);
  if (sign === 0) return true;
  return Math.sign(amountCents) === sign;
}

/* ------------------------------------------------------------------ *
 * The receipt, in the owner's own terms
 * ------------------------------------------------------------------ */

export interface ReceiptInput {
  /** What the shop owed before this visit. Negative means the shop was in credit. */
  previousBalanceCents: Cents;
  /** Goods bought on this visit. */
  goodsCents: Cents;
  /** Credit for goods returned on this visit. */
  returnsCents: Cents;
  /** Cash handed over on this visit. */
  paidCents: Cents;
}

export interface ReceiptTotals extends ReceiptInput {
  /** goods − returns. Negative when a shop returns more than it buys, which is allowed. */
  netBillCents: Cents;
  /** previous balance + net bill. */
  totalDueCents: Cents;
  /** total due − paid. This is what the shop owes when the worker drives away. */
  outstandingCents: Cents;
}

/**
 * The receipt calculation exactly as the owner states it:
 *
 *   net bill    = goods purchased − return value
 *   total due   = previous outstanding balance + net bill
 *   outstanding = total due − amount paid
 *
 * One place, so the printed receipt, the POS screen, the ledger and the dashboard can never
 * disagree about a shop's figures.
 */
export function receiptTotals(input: ReceiptInput): ReceiptTotals {
  requireCents(input.previousBalanceCents, 'A previous balance', { allowNegative: true });
  requireCents(input.goodsCents, 'Goods purchased');
  requireCents(input.returnsCents, 'A return value');
  requireCents(input.paidCents, 'An amount paid');

  const netBillCents = input.goodsCents - input.returnsCents;
  const totalDueCents = input.previousBalanceCents + netBillCents;

  return {
    ...input,
    netBillCents,
    totalDueCents,
    outstandingCents: totalDueCents - input.paidCents,
  };
}

/** The balance a list of ledger movements adds up to. */
export function balanceFromEntries(amountsCents: readonly Cents[]): Cents {
  return amountsCents.reduce((total, amount) => total + amount, 0);
}

/* ------------------------------------------------------------------ *
 * Ageing
 * ------------------------------------------------------------------ */

/**
 * How long a debt has been overdue. The boundaries are the usual ones, and the owner should
 * confirm them before the ledger screen is used in front of anybody.
 */
export const AGEING_BUCKETS = [
  'not_due',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_90_plus',
] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AgeingBucketSchema = z.enum(AGEING_BUCKETS);

/** The label each bucket carries on the report. */
export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
  not_due: 'Not yet due',
  days_1_30: '1–30 days overdue',
  days_31_60: '31–60 days overdue',
  days_61_90: '61–90 days overdue',
  days_90_plus: 'Over 90 days overdue',
};

export interface AgeingSale {
  /** What this credit sale added to the balance. Positive. */
  amountCents: Cents;
  /** When it falls due. */
  dueDate: Date;
}

export interface AgeingInput {
  sales: readonly AgeingSale[];
  /** Everything that reduces the balance — payments, return credits — as a positive total. */
  creditsCents: Cents;
  asOf: Date;
}

export interface AgeingResult {
  /** Total sales − total credits. Negative means the shop is in credit. */
  outstandingCents: Cents;
  /** The unpaid remainder, split by how overdue it is. Empty buckets are present as 0. */
  buckets: Record<AgeingBucket, Cents>;
  /** How overdue the oldest unpaid debt is, or null if nothing is overdue. */
  oldestOverdueDays: number | null;
}

/**
 * Splits what a shop owes by age, applying its payments to its **oldest debts first**.
 *
 * FIFO matters: a shop that pays something every visit should never show a 90-day debt while its
 * recent bills look settled. The owner's decision — chase this shop or keep supplying it — rests
 * on this number, so the allocation is explicit rather than implied.
 *
 * A shop that has paid more than it owes comes back with a negative outstanding and no buckets:
 * it is in credit, and credit is not aged.
 */
export function ageOutstanding(input: AgeingInput): AgeingResult {
  requireCents(input.creditsCents, 'A credit total');
  input.sales.forEach((sale, index) => {
    requireCents(sale.amountCents, `Sale ${index + 1}`);
  });

  const buckets = emptyBuckets();
  const totalSales = input.sales.reduce((sum, sale) => sum + sale.amountCents, 0);
  const outstandingCents = totalSales - input.creditsCents;

  if (outstandingCents <= 0) {
    return { outstandingCents, buckets, oldestOverdueDays: null };
  }

  // Oldest due date first: payments settle the debts that have been owed longest.
  const oldestFirst = [...input.sales].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  let creditLeft = input.creditsCents;
  let oldestOverdueDays: number | null = null;

  for (const sale of oldestFirst) {
    const applied = Math.min(creditLeft, sale.amountCents);
    creditLeft -= applied;
    const unpaid = sale.amountCents - applied;
    if (unpaid === 0) continue;

    const overdueDays = daysBetween(sale.dueDate, input.asOf);
    buckets[bucketFor(overdueDays)] += unpaid;

    if (overdueDays > 0 && (oldestOverdueDays === null || overdueDays > oldestOverdueDays)) {
      oldestOverdueDays = overdueDays;
    }
  }

  return { outstandingCents, buckets, oldestOverdueDays };
}

export function bucketFor(overdueDays: number): AgeingBucket {
  if (overdueDays <= 0) return 'not_due';
  if (overdueDays <= 30) return 'days_1_30';
  if (overdueDays <= 60) return 'days_31_60';
  if (overdueDays <= 90) return 'days_61_90';
  return 'days_90_plus';
}

export function emptyBuckets(): Record<AgeingBucket, Cents> {
  return {
    not_due: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
  };
}

/**
 * Whole days from one date to another, counted on calendar days in UTC.
 *
 * Deliberately not hour arithmetic: a sale at 9am and one at 5pm on the same day are the same
 * age, and a clock change must not move a debt into another bucket.
 */
export function daysBetween(from: Date, to: Date): number {
  const DAY = 86_400_000;
  return Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / DAY);
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** The due date of a credit sale, given the agreed term. */
export function dueDateFor(soldAt: Date, creditTermDays: number): Date {
  if (!Number.isInteger(creditTermDays) || creditTermDays < 0) {
    throw new RangeError(`A credit term must be a whole number of days, got ${creditTermDays}.`);
  }
  const due = new Date(
    Date.UTC(soldAt.getUTCFullYear(), soldAt.getUTCMonth(), soldAt.getUTCDate()),
  );
  due.setUTCDate(due.getUTCDate() + creditTermDays);
  return due;
}

/* ------------------------------------------------------------------ *
 * The wire contracts for M6's credit endpoints
 *
 * Money here is a rupee number with at most two decimals, like the rest of the API. The service
 * converts to cents at the boundary and does every calculation above in integers.
 * ------------------------------------------------------------------ */

export const CreditEntryResponseSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  kind: CreditEntryKindSchema,
  /** Signed: a sale is positive, a payment and a return credit are negative. */
  amount: LedgerAmountSchema,
  /** The event this came from. The same value twice is the same entry, never a second one. */
  sourceUuid: z.string().min(1).max(64),
  /** The sale this relates to, so a ledger row can be traced to a receipt on A7. */
  saleUuid: z.string().min(1).max(64).nullable(),
  /** When a credit sale falls due. Null for payments, returns and adjustments. */
  dueDate: z.coerce.date().nullable(),
  /** When it happened in the van, which is not when the server heard about it. */
  occurredAt: z.coerce.date(),
  recordedAt: z.coerce.date(),
  note: z.string().nullable(),
});
export type CreditEntryResponse = z.infer<typeof CreditEntryResponseSchema>;

/** One row of a shop's statement: the entry plus what the shop owed after it. */
export const LedgerRowSchema = CreditEntryResponseSchema.extend({
  runningBalance: LedgerAmountSchema,
});
export type LedgerRow = z.infer<typeof LedgerRowSchema>;

export const ShopLedgerQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ShopLedgerQuery = z.infer<typeof ShopLedgerQuerySchema>;

export const AgeingBucketsSchema = z.object({
  not_due: LedgerAmountSchema,
  days_1_30: LedgerAmountSchema,
  days_31_60: LedgerAmountSchema,
  days_61_90: LedgerAmountSchema,
  days_90_plus: LedgerAmountSchema,
});

/** A9 — one shop's ledger: who they are, what they owe, how old it is, and the history. */
export const ShopLedgerResponseSchema = z.object({
  shopId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  creditLimit: LedgerAmountSchema,
  /** What the shop owes now. Negative means it is in credit. */
  balance: LedgerAmountSchema,
  /** True when the balance has gone past the limit the owner set. */
  overLimit: z.boolean(),
  buckets: AgeingBucketsSchema,
  oldestOverdueDays: z.number().int().nullable(),
  entries: z.array(LedgerRowSchema),
});
export type ShopLedgerResponse = z.infer<typeof ShopLedgerResponseSchema>;

/** A9 — recording a payment the owner collected or confirmed. */
export const RecordPaymentSchema = z.object({
  shopId: z.string().uuid(),
  /** Positive rupees. The ledger stores it as a negative movement. */
  amount: z.number().positive(),
  /**
   * The caller's own id for this payment, so retrying a request that may already have been
   * applied cannot post the money twice. Generated by the client; a uuid is the obvious choice.
   */
  sourceUuid: z.string().min(1).max(64),
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type RecordPayment = z.infer<typeof RecordPaymentSchema>;

/** A1 — the two dashboard widgets M6 owns. */
export const CreditSummaryResponseSchema = z.object({
  asOf: z.coerce.date(),
  /** Every shop's debt added up. Shops in credit are not netted off against it. */
  totalOutstanding: LedgerAmountSchema,
  shopsOwing: z.number().int().nonnegative(),
  /** Shops with anything at all past its due date. */
  overdueShops: z.number().int().nonnegative(),
  overdueOutstanding: LedgerAmountSchema,
});
export type CreditSummaryResponse = z.infer<typeof CreditSummaryResponseSchema>;

/** A12 — the credit ageing report, per shop and in total. */
export const AgeingReportRowSchema = z.object({
  shopId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  outstanding: LedgerAmountSchema,
  buckets: AgeingBucketsSchema,
  oldestOverdueDays: z.number().int().nullable(),
});
export type AgeingReportRow = z.infer<typeof AgeingReportRowSchema>;

export const AgeingReportResponseSchema = z.object({
  asOf: z.coerce.date(),
  totals: AgeingBucketsSchema,
  totalOutstanding: LedgerAmountSchema,
  shops: z.array(AgeingReportRowSchema),
});
export type AgeingReportResponse = z.infer<typeof AgeingReportResponseSchema>;

function requireCents(value: Cents, what: string, options: { allowNegative?: boolean } = {}): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${what} must be a whole number of cents, got ${value}.`);
  }
  if (!options.allowNegative && value < 0) {
    throw new RangeError(`${what} cannot be negative, got ${value}.`);
  }
}
