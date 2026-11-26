import type { Cents, UnitType } from '@jogylink/shared';

/**
 * The shapes the POS screens hand to the repository, and get back from it.
 *
 * These are the DEVICE's types, deliberately not the server's: the `sale` and `sale_line` tables
 * on the server belong to M5 and `return` belongs to M7 (see packages/db/src/schema/index.ts).
 * When their API schemas land in @jogylink/shared, the sync engine maps these onto them at the
 * one place that talks to the server — the screens and this storage layer do not change.
 *
 * Money is always integer cents and never a float. Quantities are whole numbers: pieces, or
 * grams when the unit type is `weight`.
 */

export interface SaleLineInput {
  productId: string;
  /** The batch this came off the van, when FEFO could pick one. */
  batchId?: string | null;
  unitType: UnitType;
  /** Pieces, or grams for a weight product. Always a positive whole number. */
  quantity: number;
  /** Per piece, or per kilogram for a weight product. */
  unitPriceCents: Cents;
  /** What this line adds to the bill. The pricing arithmetic is M5's, not ours. */
  lineTotalCents: Cents;
}

export interface SaleInput {
  /** Generated on the device before anything is saved. The server's primary key too. */
  uuid: string;
  shopId: string;
  /** The worker who made the sale. */
  userId: string;
  soldAt: Date;
  lines: SaleLineInput[];
  /** Must equal the sum of the line totals. */
  totalCents: Cents;
  note?: string | null;
  /**
   * Cash handed over at the shop. Recorded as its own payment event, in the same transaction as
   * the sale, so the two can never come apart.
   */
  payment?: PaymentInput;
}

export const PAYMENT_METHODS = ['cash', 'payhere'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentInput {
  uuid: string;
  shopId: string;
  /** Positive. A payment reduces what the shop owes. */
  amountCents: Cents;
  method: PaymentMethod;
  receivedAt: Date;
}

export interface ReturnInput {
  uuid: string;
  shopId: string;
  productId: string;
  batchId?: string | null;
  returnUnit: UnitType;
  /** Pieces, or grams for a weight product. */
  quantityReturned: number;
  /** Part of a pack or a loose weight rather than whole units — M7's partial return. */
  isPartial: boolean;
  /** What the shop is credited. Reduces what it owes. */
  creditCents: Cents;
  /** Where the evidence photo sits on the device, if one was taken. */
  photoPath?: string | null;
  returnedAt: Date;
}

/** A sale read back off the device, for the reprint on A7. */
export interface StoredSale {
  uuid: string;
  shopId: string;
  userId: string;
  soldAt: Date;
  totalCents: Cents;
  note: string | null;
  lines: StoredSaleLine[];
  /** null while the server has not confirmed this sale yet. */
  syncedAt: Date | null;
}

export interface StoredSaleLine extends SaleLineInput {
  batchId: string | null;
}

/** A server shop row as the device last saw it. Never edited on the device. */
export interface CachedShop {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  locality?: string | null;
  creditLimitCents: Cents;
  routeId?: string | null;
  visitOrder?: number | null;
  isActive: boolean;
  /** The balance as the server last reported it, before any unsynced events on this device. */
  serverBalanceCents: Cents;
}

/** A shop on today's route list, with the balance the worker should actually be told. */
export interface RouteShop extends CachedShop {
  routeId: string | null;
  visitOrder: number | null;
  phone: string | null;
  address: string | null;
  locality: string | null;
  /** The server balance plus everything this device has not managed to send yet. */
  balanceCents: Cents;
}

/** A server product row as the device last saw it. The POS never sees the retail price. */
export interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  unitType: UnitType;
  wholesalePriceCents: Cents;
  active: boolean;
}

/**
 * What a successful sync brings back: which events the server accepted, and fresh copies of the
 * rows the device caches. Applied in one transaction — see `applySyncResult`.
 */
export interface SyncResult {
  acceptedUuids: readonly string[];
  shops?: readonly CachedShop[];
  products?: readonly CachedProduct[];
}
