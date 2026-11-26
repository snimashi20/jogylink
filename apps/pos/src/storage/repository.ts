import type { Cents, UnitType } from '@jogylink/shared';
import { Outbox } from './outbox';
import {
  PAYMENT_METHODS,
  type CachedProduct,
  type CachedShop,
  type PaymentInput,
  type ReturnInput,
  type RouteShop,
  type SaleInput,
  type StoredSale,
  type StoredSaleLine,
  type SyncResult,
} from './records';
import type { RejectedEvent, SqliteDriver, SqlValue, SyncStatus } from './types';

/**
 * What every POS screen uses, and the only way M4, M5 and M7 touch storage.
 *
 * The contract is the one agreed in docs/sync.md. Nothing here needs a network: a sale is written
 * and its receipt printed with no signal, and the outbox worries about the server later.
 */
export interface PosRepository {
  /** Writes a sale, its lines, any cash taken, and the outbox events, all or nothing. */
  saveSale(sale: SaleInput): Promise<void>;
  /** Writes a return and its outbox event. */
  saveReturn(ret: ReturnInput): Promise<void>;
  /** Writes a payment against a shop's balance and its outbox event. */
  savePayment(payment: PaymentInput): Promise<void>;
  /** Today's route in visit order, each shop with the balance to show the worker. */
  getRouteShops(routeId: string): Promise<RouteShop[]>;
  /** What the shop owes, including what this device has not managed to send yet. */
  getBalance(shopId: string): Promise<Cents>;
  /** For the reprint on A7. Returns null if this device has no such sale. */
  getSale(uuid: string): Promise<StoredSale | null>;
  /** The price list for billing. Inactive products are left out. */
  getProducts(): Promise<CachedProduct[]>;
  /** What the sync status screen, the banner and the sign-out guard read. */
  getSyncStatus(): Promise<SyncStatus>;
  /** Everything not yet on the server, refused events included. Blocks signing out. */
  getUnsentCount(): Promise<number>;
  /** The events the server refused, for the sync status screen. Never auto-retried. */
  getRejectedEvents(limit?: number): Promise<RejectedEvent[]>;
  /** Puts refused events back in the queue. Only ever from an explicit action by a person. */
  retryRejected(uuids?: readonly string[]): Promise<number>;
  /**
   * Applies a successful sync: confirmations and fresh cached rows, in one transaction.
   *
   * Returns how many events this actually moved from pending to synced, which is not the length
   * of `acceptedUuids`: a server may name an event it already confirmed, or one this device has
   * never heard of. The sync engine needs the real number to know whether it is making progress.
   */
  applySyncResult(result: SyncResult): Promise<{ confirmed: number }>;
}

/**
 * Every unsynced event on this device, as a signed amount against a shop's balance: a sale adds
 * to what the shop owes, a payment and a return credit reduce it.
 *
 * Used as a CTE. It is the difference between the balance the server last reported and the truth,
 * which is why the cached balance is only ever refreshed in the same transaction that marks
 * events synced — otherwise an event could be counted in both.
 */
const PENDING_BALANCE_DELTA = `
  SELECT s.shop_id AS shop_id, s.total_cents AS delta
    FROM sale s JOIN outbox o ON o.uuid = s.uuid
   WHERE o.synced_at IS NULL
   UNION ALL
  SELECT p.shop_id AS shop_id, -p.amount_cents AS delta
    FROM payment p JOIN outbox o ON o.uuid = p.uuid
   WHERE o.synced_at IS NULL
   UNION ALL
  SELECT r.shop_id AS shop_id, -r.credit_cents AS delta
    FROM "return" r JOIN outbox o ON o.uuid = r.uuid
   WHERE o.synced_at IS NULL`;

export interface PosRepositoryOptions {
  /** The clock, injectable so the tests do not depend on wall time. */
  now?: () => number;
  outbox?: Outbox;
}

export class SqlitePosRepository implements PosRepository {
  private readonly now: () => number;
  private readonly outbox: Outbox;

  constructor(
    private readonly db: SqliteDriver,
    options: PosRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.outbox = options.outbox ?? new Outbox(db, { now: this.now });
  }

  async saveSale(sale: SaleInput): Promise<void> {
    validateSale(sale);

    await this.db.transaction(async () => {
      const inserted = await this.db.run(
        `INSERT INTO sale (uuid, shop_id, user_id, sold_at, total_cents, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (uuid) DO NOTHING;`,
        [
          sale.uuid,
          sale.shopId,
          sale.userId,
          sale.soldAt.getTime(),
          sale.totalCents,
          sale.note ?? null,
          this.now(),
        ],
      );

      // Already here: the worker pressed the button twice, or the screen retried. The sale that
      // was recorded first stands, and nothing is written again.
      if (inserted.changes === 0) return;

      for (const [index, line] of sale.lines.entries()) {
        await this.db.run(
          `INSERT INTO sale_line (sale_uuid, line_no, product_id, batch_id, unit_type,
                                  quantity, unit_price_cents, line_total_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            sale.uuid,
            index + 1,
            line.productId,
            line.batchId ?? null,
            line.unitType,
            line.quantity,
            line.unitPriceCents,
            line.lineTotalCents,
          ],
        );
      }

      await this.outbox.append({ uuid: sale.uuid, type: 'sale', payload: saleEvent(sale) });

      if (sale.payment) await this.writePayment(sale.payment);
    });
  }

  async savePayment(payment: PaymentInput): Promise<void> {
    validatePayment(payment);
    await this.db.transaction(() => this.writePayment(payment));
  }

  async saveReturn(ret: ReturnInput): Promise<void> {
    validateReturn(ret);

    await this.db.transaction(async () => {
      const inserted = await this.db.run(
        `INSERT INTO "return" (uuid, shop_id, product_id, batch_id, return_unit,
                               quantity_returned, is_partial, credit_cents, photo_path,
                               returned_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (uuid) DO NOTHING;`,
        [
          ret.uuid,
          ret.shopId,
          ret.productId,
          ret.batchId ?? null,
          ret.returnUnit,
          ret.quantityReturned,
          ret.isPartial ? 1 : 0,
          ret.creditCents,
          ret.photoPath ?? null,
          ret.returnedAt.getTime(),
          this.now(),
        ],
      );
      if (inserted.changes === 0) return;

      await this.outbox.append({ uuid: ret.uuid, type: 'return', payload: returnEvent(ret) });
    });
  }

  /**
   * The route list. Shops the owner has switched off are left out — no new business goes to them
   * — but anything already sold to them still counts towards their balance.
   */
  async getRouteShops(routeId: string): Promise<RouteShop[]> {
    const rows = await this.db.all<ShopRow>(
      `WITH pending AS (${PENDING_BALANCE_DELTA})
       SELECT s.id, s.code, s.name, s.phone, s.address, s.locality, s.credit_limit_cents,
              s.route_id, s.visit_order, s.is_active, s.server_balance_cents,
              s.server_balance_cents
                + COALESCE((SELECT SUM(delta) FROM pending WHERE pending.shop_id = s.id), 0)
                AS balance_cents
         FROM shop s
        WHERE s.route_id = ? AND s.is_active = 1
        ORDER BY s.visit_order, s.name;`,
      [routeId],
    );
    return rows.map(toRouteShop);
  }

  async getBalance(shopId: string): Promise<Cents> {
    // A shop can be billed before the cache has ever seen it (the owner added it mid-route), so
    // a missing cached row counts as a server balance of zero rather than an error.
    const [row] = await this.db.all<{ balance_cents: number }>(
      `WITH pending AS (${PENDING_BALANCE_DELTA})
       SELECT COALESCE((SELECT server_balance_cents FROM shop WHERE id = ?), 0)
            + COALESCE((SELECT SUM(delta) FROM pending WHERE pending.shop_id = ?), 0)
              AS balance_cents;`,
      [shopId, shopId],
    );
    return row?.balance_cents ?? 0;
  }

  async getSale(uuid: string): Promise<StoredSale | null> {
    const [sale] = await this.db.all<{
      uuid: string;
      shop_id: string;
      user_id: string;
      sold_at: number;
      total_cents: number;
      note: string | null;
      synced_at: number | null;
    }>(
      `SELECT s.uuid, s.shop_id, s.user_id, s.sold_at, s.total_cents, s.note, o.synced_at
         FROM sale s LEFT JOIN outbox o ON o.uuid = s.uuid
        WHERE s.uuid = ?;`,
      [uuid],
    );
    if (!sale) return null;

    const lines = await this.db.all<{
      product_id: string;
      batch_id: string | null;
      unit_type: string;
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
    }>(
      `SELECT product_id, batch_id, unit_type, quantity, unit_price_cents, line_total_cents
         FROM sale_line WHERE sale_uuid = ? ORDER BY line_no;`,
      [uuid],
    );

    return {
      uuid: sale.uuid,
      shopId: sale.shop_id,
      userId: sale.user_id,
      soldAt: new Date(sale.sold_at),
      totalCents: sale.total_cents,
      note: sale.note,
      syncedAt: sale.synced_at == null ? null : new Date(sale.synced_at),
      lines: lines.map((line): StoredSaleLine => ({
        productId: line.product_id,
        batchId: line.batch_id,
        unitType: line.unit_type as UnitType,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
        lineTotalCents: line.line_total_cents,
      })),
    };
  }

  async getProducts(): Promise<CachedProduct[]> {
    const rows = await this.db.all<{
      id: string;
      sku: string;
      name: string;
      unit_type: string;
      wholesale_price_cents: number;
      active: number;
    }>(
      `SELECT id, sku, name, unit_type, wholesale_price_cents, active
         FROM product WHERE active = 1 ORDER BY name;`,
    );
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      unitType: row.unit_type as UnitType,
      wholesalePriceCents: row.wholesale_price_cents,
      active: row.active === 1,
    }));
  }

  getSyncStatus(): Promise<SyncStatus> {
    return this.outbox.status();
  }

  getUnsentCount(): Promise<number> {
    return this.outbox.unsentCount();
  }

  getRejectedEvents(limit?: number): Promise<RejectedEvent[]> {
    return this.outbox.rejected(limit);
  }

  retryRejected(uuids?: readonly string[]): Promise<number> {
    return this.outbox.clearRejections(uuids);
  }

  /**
   * Confirmations and fresh cached rows land together or not at all. That is what keeps a
   * balance honest: the moment an event stops counting as pending, the cached balance that now
   * includes it is already in place.
   */
  async applySyncResult(result: SyncResult): Promise<{ confirmed: number }> {
    return this.db.transaction(async () => {
      const confirmed = await this.outbox.markSynced(result.acceptedUuids);

      const refreshedAt = this.now();
      for (const shop of result.shops ?? []) await this.cacheShop(shop, refreshedAt);
      for (const product of result.products ?? []) await this.cacheProduct(product, refreshedAt);

      return { confirmed };
    });
  }

  private async writePayment(payment: PaymentInput): Promise<void> {
    const inserted = await this.db.run(
      `INSERT INTO payment (uuid, shop_id, amount_cents, method, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (uuid) DO NOTHING;`,
      [
        payment.uuid,
        payment.shopId,
        payment.amountCents,
        payment.method,
        payment.receivedAt.getTime(),
        this.now(),
      ],
    );
    if (inserted.changes === 0) return;

    await this.outbox.append({
      uuid: payment.uuid,
      type: 'payment',
      payload: paymentEvent(payment),
    });
  }

  private async cacheShop(shop: CachedShop, refreshedAt: number): Promise<void> {
    await this.db.run(
      `INSERT INTO shop (id, code, name, phone, address, locality, credit_limit_cents,
                         route_id, visit_order, is_active, server_balance_cents, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         code                 = excluded.code,
         name                 = excluded.name,
         phone                = excluded.phone,
         address              = excluded.address,
         locality             = excluded.locality,
         credit_limit_cents   = excluded.credit_limit_cents,
         route_id             = excluded.route_id,
         visit_order          = excluded.visit_order,
         is_active            = excluded.is_active,
         server_balance_cents = excluded.server_balance_cents,
         refreshed_at         = excluded.refreshed_at;`,
      [
        shop.id,
        shop.code,
        shop.name,
        shop.phone ?? null,
        shop.address ?? null,
        shop.locality ?? null,
        shop.creditLimitCents,
        shop.routeId ?? null,
        shop.visitOrder ?? null,
        shop.isActive ? 1 : 0,
        shop.serverBalanceCents,
        refreshedAt,
      ],
    );
  }

  private async cacheProduct(product: CachedProduct, refreshedAt: number): Promise<void> {
    await this.db.run(
      `INSERT INTO product (id, sku, name, unit_type, wholesale_price_cents, active, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         sku                   = excluded.sku,
         name                  = excluded.name,
         unit_type             = excluded.unit_type,
         wholesale_price_cents = excluded.wholesale_price_cents,
         active                = excluded.active,
         refreshed_at          = excluded.refreshed_at;`,
      [
        product.id,
        product.sku,
        product.name,
        product.unitType,
        product.wholesalePriceCents,
        product.active ? 1 : 0,
        refreshedAt,
      ] satisfies SqlValue[],
    );
  }
}

/** Opens the facade over an already-migrated device database. */
export function createPosRepository(
  db: SqliteDriver,
  options: PosRepositoryOptions = {},
): PosRepository {
  return new SqlitePosRepository(db, options);
}

interface ShopRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  locality: string | null;
  credit_limit_cents: number;
  route_id: string | null;
  visit_order: number | null;
  is_active: number;
  server_balance_cents: number;
  balance_cents: number;
}

function toRouteShop(row: ShopRow): RouteShop {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    address: row.address,
    locality: row.locality,
    creditLimitCents: row.credit_limit_cents,
    routeId: row.route_id,
    visitOrder: row.visit_order,
    isActive: row.is_active === 1,
    serverBalanceCents: row.server_balance_cents,
    balanceCents: row.balance_cents,
  };
}

/*
 * The outbox payloads: what the sync engine will POST. Dates go out as ISO strings and the
 * version marker lets the server tell an older device's events apart from a newer one's.
 */

function saleEvent(sale: SaleInput) {
  return {
    v: 1,
    uuid: sale.uuid,
    shopId: sale.shopId,
    userId: sale.userId,
    soldAt: sale.soldAt.toISOString(),
    totalCents: sale.totalCents,
    note: sale.note ?? null,
    lines: sale.lines.map((line, index) => ({
      lineNo: index + 1,
      productId: line.productId,
      batchId: line.batchId ?? null,
      unitType: line.unitType,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    })),
  };
}

function paymentEvent(payment: PaymentInput) {
  return {
    v: 1,
    uuid: payment.uuid,
    shopId: payment.shopId,
    amountCents: payment.amountCents,
    method: payment.method,
    receivedAt: payment.receivedAt.toISOString(),
  };
}

function returnEvent(ret: ReturnInput) {
  return {
    v: 1,
    uuid: ret.uuid,
    shopId: ret.shopId,
    productId: ret.productId,
    batchId: ret.batchId ?? null,
    returnUnit: ret.returnUnit,
    quantityReturned: ret.quantityReturned,
    isPartial: ret.isPartial,
    creditCents: ret.creditCents,
    photoPath: ret.photoPath ?? null,
    returnedAt: ret.returnedAt.toISOString(),
  };
}

/*
 * Validation. These are not defensive niceties: a bill that does not add up, or a rupee value
 * where cents were expected, is money quietly going missing. Better a thrown error on the van
 * than a wrong balance the owner finds weeks later.
 */

function validateSale(sale: SaleInput): void {
  requireUuid(sale.uuid, 'A sale');
  if (sale.lines.length === 0) throw new Error('A sale needs at least one line.');
  requireCents(sale.totalCents, 'A sale total');

  let sum = 0;
  sale.lines.forEach((line, index) => {
    const where = `Line ${index + 1}`;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`${where} needs a positive whole quantity, got ${line.quantity}.`);
    }
    requireCents(line.unitPriceCents, `${where} unit price`);
    requireCents(line.lineTotalCents, `${where} total`);
    sum += line.lineTotalCents;
  });

  if (sum !== sale.totalCents) {
    throw new Error(
      `A sale total of ${sale.totalCents} cents does not match its lines, which add up to ` +
        `${sum} cents. The printed receipt and the shop's balance must agree.`,
    );
  }

  if (sale.payment) {
    validatePayment(sale.payment);
    if (sale.payment.shopId !== sale.shopId) {
      throw new Error('The cash taken with a sale must be against the same shop.');
    }
  }
}

function validatePayment(payment: PaymentInput): void {
  requireUuid(payment.uuid, 'A payment');
  requireCents(payment.amountCents, 'A payment amount');
  if (payment.amountCents === 0) throw new Error('A payment of nothing is not a payment.');
  if (!(PAYMENT_METHODS as readonly string[]).includes(payment.method)) {
    throw new Error(`Unknown payment method "${payment.method}".`);
  }
}

function validateReturn(ret: ReturnInput): void {
  requireUuid(ret.uuid, 'A return');
  if (!Number.isInteger(ret.quantityReturned) || ret.quantityReturned <= 0) {
    throw new Error(`A return needs a positive whole quantity, got ${ret.quantityReturned}.`);
  }
  requireCents(ret.creditCents, 'A return credit');
}

function requireUuid(uuid: string, what: string): void {
  if (uuid.length === 0) throw new Error(`${what} needs a uuid generated on the device.`);
}

function requireCents(value: Cents, what: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(
      `${what} must be a whole number of cents, got ${value}. Rupees are never passed in.`,
    );
  }
  if (value < 0) throw new Error(`${what} cannot be negative, got ${value}.`);
}
