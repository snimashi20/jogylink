import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { creditEntries, shops } from '@jogylink/db';
import {
  ageOutstanding,
  dueDateFor,
  emptyBuckets,
  fromCents,
  toCents,
  type AgeingBucket,
  type AgeingReportResponse,
  type AgeingReportRow,
  type Cents,
  type CreditEntryKind,
  type CreditEntryResponse,
  type CreditSummaryResponse,
  type LedgerRow,
  type RecordPayment,
  type ShopLedgerQuery,
  type ShopLedgerResponse,
} from '@jogylink/shared';
import { isUniqueViolation } from '../common/db-errors';
import { DB, type Db } from '../db/db.module';
import { SettingsService } from '../settings/settings.service';

type CreditEntryRecord = typeof creditEntries.$inferSelect;

/** What the ledger needs to post one movement. Money is cents; the direction comes from `kind`. */
export interface PostEntry {
  shopId: string;
  kind: CreditEntryKind;
  /** Unsigned. The service applies the sign that belongs to the kind. */
  amountCents: Cents;
  /** The event id. Posting the same one twice is a no-op, not a second entry. */
  sourceUuid: string;
  saleUuid?: string | null;
  occurredAt: Date;
  recordedBy?: string | null;
  note?: string | null;
}

/**
 * M6 — the credit ledger.
 *
 * Balances are derived from the entries, never stored. The ledger is append-only: a mistake is
 * corrected by posting an `adjustment`, so the history of how a figure was reached survives.
 *
 * **Posting is idempotent.** Every entry carries the uuid of the event it came from, that column
 * is UNIQUE, and inserts use `ON CONFLICT DO NOTHING`. A POS that uploads the same morning twice,
 * a retried request, a sync that is interrupted and resumed — none of them can double a shop's
 * debt. This is the property the whole offline design depends on, so it is enforced by the
 * database rather than by remembering to check first.
 */
@Injectable()
export class CreditService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /**
   * Posts a credit sale. Called by the sync endpoint when a sale arrives from the van, inside
   * the same transaction that stores the sale itself.
   *
   * The due date comes from the `credit_term_days` setting, so changing the trade term changes
   * what falls due next — it never rewrites what was already agreed on past sales.
   */
  async recordSale(entry: Omit<PostEntry, 'kind'>): Promise<CreditEntryResponse | null> {
    const termDays = await this.settings.get('credit_term_days');
    return this.post(
      { ...entry, kind: 'sale' },
      { dueDate: dueDateFor(entry.occurredAt, termDays) },
    );
  }

  /** Posts the credit for returned goods. Reduces what the shop owes. */
  recordReturn(entry: Omit<PostEntry, 'kind'>): Promise<CreditEntryResponse | null> {
    return this.post({ ...entry, kind: 'return' });
  }

  /** Posts a payment. Reduces what the shop owes. */
  recordPayment(entry: Omit<PostEntry, 'kind'>): Promise<CreditEntryResponse | null> {
    return this.post({ ...entry, kind: 'payment' });
  }

  /**
   * The owner correcting the ledger. The amount is signed here, because only the person posting
   * it knows which way the correction goes.
   */
  recordAdjustment(
    entry: Omit<PostEntry, 'kind' | 'amountCents'> & { amountCents: Cents },
  ): Promise<CreditEntryResponse | null> {
    return this.post({ ...entry, kind: 'adjustment' }, { signed: true });
  }

  /** A9's payment action. Returns the entry and what the shop owes afterwards. */
  async collectPayment(
    body: RecordPayment,
    recordedBy: string,
  ): Promise<{ entry: CreditEntryResponse | null; balance: number }> {
    await this.requireShop(body.shopId);

    const entry = await this.recordPayment({
      shopId: body.shopId,
      amountCents: toCents(body.amount),
      sourceUuid: body.sourceUuid,
      occurredAt: body.receivedAt ?? new Date(),
      recordedBy,
      note: body.note ?? null,
    });

    return { entry, balance: fromCents(await this.balanceCents(body.shopId)) };
  }

  /** A9 — one shop's statement, with a running balance and how old its debt is. */
  async getShopLedger(shopId: string, query: ShopLedgerQuery): Promise<ShopLedgerResponse> {
    const shop = await this.requireShop(shopId);

    /*
     * Every entry, oldest first: the running balance of a statement has to start from zero, so
     * a date filter cannot be applied before it is calculated.
     *
     * The order is (occurred, recorded, id). Several movements commonly share one instant — a
     * sale, its return and the cash all happen at one visit — and without the last two terms
     * their order comes down to a random uuid, so the same statement would read differently on
     * each load and the running balance would appear to jump about.
     */
    const all = await this.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.shopId, shopId))
      .orderBy(asc(creditEntries.occurredAt), asc(creditEntries.recordedAt), asc(creditEntries.id));

    let running = 0;
    const rows: LedgerRow[] = all.map((row) => {
      running += toCents(Number(row.amount));
      return { ...toEntryResponse(row), runningBalance: fromCents(running) };
    });

    const from = query.from?.getTime();
    const to = query.to?.getTime();
    const visible = rows
      .filter(
        (row) =>
          (from === undefined || row.occurredAt.getTime() >= from) &&
          (to === undefined || row.occurredAt.getTime() <= to),
      )
      .slice(-query.limit)
      .reverse(); // newest first on screen

    const ageing = ageEntries(all, new Date());
    const creditLimitCents = toCents(Number(shop.creditLimit));

    return {
      shopId,
      code: shop.code,
      name: shop.name,
      creditLimit: fromCents(creditLimitCents),
      balance: fromCents(running),
      overLimit: running > creditLimitCents,
      buckets: bucketsToMoney(ageing.buckets),
      oldestOverdueDays: ageing.oldestOverdueDays,
      entries: visible,
    };
  }

  /** A1 — the total outstanding credit and the overdue count. */
  async getSummary(asOf = new Date()): Promise<CreditSummaryResponse> {
    const rows = await this.ageAllShops(asOf);

    let totalOutstanding = 0;
    let shopsOwing = 0;
    let overdueShops = 0;
    let overdueOutstanding = 0;

    for (const row of rows) {
      // Shops in credit are NOT netted off: the owner wants to know what is owed to the
      // business, and a shop that has overpaid does not reduce another shop's debt.
      if (row.outstandingCents <= 0) continue;
      totalOutstanding += row.outstandingCents;
      shopsOwing += 1;

      const overdue = overdueTotal(row.buckets);
      if (overdue > 0) {
        overdueShops += 1;
        overdueOutstanding += overdue;
      }
    }

    return {
      asOf,
      totalOutstanding: fromCents(totalOutstanding),
      shopsOwing,
      overdueShops,
      overdueOutstanding: fromCents(overdueOutstanding),
    };
  }

  /** A12 — the credit ageing report, per shop and in total. */
  async getAgeing(asOf = new Date()): Promise<AgeingReportResponse> {
    const rows = await this.ageAllShops(asOf);
    const totals = emptyBuckets();
    let totalOutstanding = 0;

    const shopRows: AgeingReportRow[] = rows
      .filter((row) => row.outstandingCents > 0)
      .map((row) => {
        totalOutstanding += row.outstandingCents;
        for (const bucket of Object.keys(totals) as AgeingBucket[]) {
          totals[bucket] += row.buckets[bucket];
        }
        return {
          shopId: row.shopId,
          code: row.code,
          name: row.name,
          outstanding: fromCents(row.outstandingCents),
          buckets: bucketsToMoney(row.buckets),
          oldestOverdueDays: row.oldestOverdueDays,
        };
      })
      // Worst first: the owner opens this report to decide who to chase.
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      asOf,
      totals: bucketsToMoney(totals),
      totalOutstanding: fromCents(totalOutstanding),
      shops: shopRows,
    };
  }

  /** What one shop owes right now, in cents. */
  async balanceCents(shopId: string): Promise<Cents> {
    const rows = await this.db
      .select({ amount: creditEntries.amount })
      .from(creditEntries)
      .where(eq(creditEntries.shopId, shopId));
    return rows.reduce((total, row) => total + toCents(Number(row.amount)), 0);
  }

  /** Entries in a window, for a statement or a report that needs the detail. */
  entriesBetween(shopId: string, from: Date, to: Date): Promise<CreditEntryRecord[]> {
    return this.db
      .select()
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.shopId, shopId),
          gte(creditEntries.occurredAt, from),
          lte(creditEntries.occurredAt, to),
        ),
      )
      .orderBy(asc(creditEntries.occurredAt), asc(creditEntries.recordedAt), asc(creditEntries.id));
  }

  /**
   * The one place a row is written.
   *
   * Returns the stored entry, or null when that `sourceUuid` was already posted — which is a
   * normal outcome, not an error: it means the caller is retrying something that already
   * happened, and the ledger is correct either way.
   */
  private async post(
    entry: PostEntry,
    options: { dueDate?: Date; signed?: boolean } = {},
  ): Promise<CreditEntryResponse | null> {
    const magnitude = options.signed ? entry.amountCents : Math.abs(entry.amountCents);
    if (!Number.isInteger(magnitude) || magnitude === 0) {
      throw new RangeError(
        `A ledger amount must be a whole non-zero number of cents, got ${entry.amountCents}.`,
      );
    }

    const amountCents = options.signed ? magnitude : entry.kind === 'sale' ? magnitude : -magnitude;

    try {
      const [row] = await this.db
        .insert(creditEntries)
        .values({
          shopId: entry.shopId,
          kind: entry.kind,
          amount: fromCents(amountCents).toFixed(2),
          sourceUuid: entry.sourceUuid,
          saleUuid: entry.saleUuid ?? null,
          dueDate: options.dueDate ?? null,
          occurredAt: entry.occurredAt,
          recordedBy: entry.recordedBy ?? null,
          note: entry.note ?? null,
        })
        .onConflictDoNothing({ target: creditEntries.sourceUuid })
        .returning();

      return row ? toEntryResponse(row) : null;
    } catch (error) {
      // A race with another request posting the same event: the same harmless outcome.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private async requireShop(shopId: string) {
    const [shop] = await this.db.select().from(shops).where(eq(shops.id, shopId)).limit(1);
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  /**
   * Ages every shop that has a ledger.
   *
   * Done in TypeScript, over the whole ledger, because applying payments to the oldest debts
   * first is awkward to express in SQL and this is the figure the owner's decisions rest on. At
   * ~300 shops that is a small query; if the ledger grows to years of history, this is the thing
   * to move into SQL.
   */
  private async ageAllShops(asOf: Date) {
    const rows = await this.db
      .select({
        shopId: creditEntries.shopId,
        code: shops.code,
        name: shops.name,
        kind: creditEntries.kind,
        amount: creditEntries.amount,
        dueDate: creditEntries.dueDate,
        occurredAt: creditEntries.occurredAt,
      })
      .from(creditEntries)
      .innerJoin(shops, eq(shops.id, creditEntries.shopId));

    const byShop = new Map<string, { code: string; name: string; entries: typeof rows }>();
    for (const row of rows) {
      const shop = byShop.get(row.shopId);
      if (shop) shop.entries.push(row);
      else byShop.set(row.shopId, { code: row.code, name: row.name, entries: [row] });
    }

    return [...byShop.entries()].map(([shopId, shop]) => ({
      shopId,
      code: shop.code,
      name: shop.name,
      ...ageEntries(shop.entries, asOf),
    }));
  }
}

type AgeableEntry = {
  kind: string;
  amount: string;
  dueDate: Date | null;
  occurredAt: Date;
};

/** Turns a shop's ledger rows into an aged balance. */
function ageEntries(entries: readonly AgeableEntry[], asOf: Date) {
  const sales: { amountCents: Cents; dueDate: Date }[] = [];
  let creditsCents = 0;

  for (const entry of entries) {
    const cents = toCents(Number(entry.amount));
    if (cents > 0) {
      // An adjustment that increases a debt has no due date of its own; it is due as of the day
      // it was made, so it starts ageing immediately rather than never.
      sales.push({ amountCents: cents, dueDate: entry.dueDate ?? entry.occurredAt });
    } else {
      creditsCents += -cents;
    }
  }

  return ageOutstanding({ sales, creditsCents, asOf });
}

function overdueTotal(buckets: Record<AgeingBucket, Cents>): Cents {
  return buckets.days_1_30 + buckets.days_31_60 + buckets.days_61_90 + buckets.days_90_plus;
}

function bucketsToMoney(buckets: Record<AgeingBucket, Cents>) {
  return {
    not_due: fromCents(buckets.not_due),
    days_1_30: fromCents(buckets.days_1_30),
    days_31_60: fromCents(buckets.days_31_60),
    days_61_90: fromCents(buckets.days_61_90),
    days_90_plus: fromCents(buckets.days_90_plus),
  };
}

function toEntryResponse(row: CreditEntryRecord): CreditEntryResponse {
  return {
    id: row.id,
    shopId: row.shopId,
    kind: row.kind as CreditEntryKind,
    amount: Number(row.amount),
    sourceUuid: row.sourceUuid,
    saleUuid: row.saleUuid,
    dueDate: row.dueDate,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    note: row.note,
  };
}
