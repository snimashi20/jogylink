import { z } from 'zod';
import { UnitTypeSchema } from './product';

/**
 * The POS sync protocol (M6) — the contract between the device outbox and `POST /sync`.
 *
 * ## Money on this endpoint is INTEGER CENTS
 *
 * Everywhere else in this package, money on the wire is a plain number of rupees with at most
 * two decimals (`MoneySchema`). This endpoint deliberately differs: every amount is an integer
 * number of cents, and every field says so in its name.
 *
 * The reason is that this is the one path where a sale exists only on a phone until it arrives.
 * Integer cents cannot be rounded wrong by a parser, a JSON library or a float, so a bill that
 * was printed for a shop and the row that lands in PostgreSQL are the same number by
 * construction. It is a deviation from the house convention, written down rather than assumed —
 * no existing schema or endpoint is changed by it.
 *
 * Dates are ISO strings. Device clocks drift, so the server records its own received-at time as
 * well and never treats `createdAt` as authoritative.
 */

export const SyncEventTypeSchema = z.enum(['sale', 'return', 'payment']);
export type SyncEventType = z.infer<typeof SyncEventTypeSchema>;

/**
 * One thing that happened in the van.
 *
 * `uuid` is generated on the device before anything is saved, and is the primary key on both
 * sides. That is what makes the whole protocol idempotent: the server inserts with
 * `ON CONFLICT (uuid) DO NOTHING`, so replaying a batch changes nothing.
 */
export const SyncEventSchema = z.object({
  uuid: z.string().min(1).max(64),
  type: SyncEventTypeSchema,
  createdAt: z.coerce.date(),
  /** Validated by the handler for the event's own type. */
  payload: z.unknown(),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

export const SyncRequestSchema = z.object({
  /** Which device is sending, for support and for spotting a device that has fallen behind. */
  deviceId: z.string().min(1).max(64).optional(),
  events: z.array(SyncEventSchema).min(1).max(500),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/**
 * An event the server will never accept, with a reason meant to be read by the worker.
 *
 * A rejection is a statement that retrying is pointless, so it must only be used for genuinely
 * unprocessable data — never for a server fault, which the device has to be allowed to retry.
 */
export const SyncRejectionSchema = z.object({
  uuid: z.string().min(1).max(64),
  reason: z.string().min(1).max(500),
});
export type SyncRejection = z.infer<typeof SyncRejectionSchema>;

/** A shop as the device should cache it, including the balance the server has derived. */
export const SyncShopSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  creditLimitCents: z.number().int().nonnegative(),
  routeId: z.string().uuid().nullable().optional(),
  visitOrder: z.number().int().positive().nullable().optional(),
  isActive: z.boolean(),
  /** What the shop owes according to the server. Negative means the shop is in credit. */
  serverBalanceCents: z.number().int(),
});
export type SyncShop = z.infer<typeof SyncShopSchema>;

/** A product as the POS should cache it. The POS never receives the retail price. */
export const SyncProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  unitType: UnitTypeSchema,
  wholesalePriceCents: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type SyncProduct = z.infer<typeof SyncProductSchema>;

/**
 * The reply.
 *
 * `accepted` lists the uuids the server now holds — whether it inserted them on this request or
 * already had them. The device marks exactly these and nothing else, so an interrupted upload
 * costs one more round trip and never a sale.
 */
export const SyncResponseSchema = z.object({
  accepted: z.array(z.string().min(1).max(64)),
  rejected: z.array(SyncRejectionSchema).default([]),
  /** Sent when the server has fresher copies; left out when there is nothing to refresh. */
  shops: z.array(SyncShopSchema).optional(),
  products: z.array(SyncProductSchema).optional(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
