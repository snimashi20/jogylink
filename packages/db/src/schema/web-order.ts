import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { PAYMENT_STATUSES, WEB_ORDER_STATUSES } from '@jogylink/shared';
import { products } from './product';

// The enum values come from the shared contract, so the database and the API can never disagree.
export const webOrderStatusEnum = pgEnum('web_order_status', WEB_ORDER_STATUSES);
export const webPaymentMethodEnum = pgEnum('web_payment_method', ['cod', 'card']);
export const webPaymentStatusEnum = pgEnum('web_payment_status', PAYMENT_STATUSES);

/**
 * M8 — `web_order`: one order placed on the public website by an individual customer.
 *
 * The customer's name, phone and address are copied onto the order (a snapshot), so a later
 * change to a customer account never rewrites a past order. Money is NUMERIC(12,2), never float.
 * Order status and payment status are separate (Solution Design V2, section 5).
 */
export const webOrders = pgTable(
  'web_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Shown to the customer and in SMS, e.g. WO-2026-00042. */
    orderNumber: text('order_number').notNull().unique(),
    /** Long random token for the tracking link sent by SMS (no order-number-only lookup). */
    trackingToken: text('tracking_token').notNull().unique(),
    status: webOrderStatusEnum('status').notNull().default('new'),
    /** Why the order was cancelled or a delivery failed. */
    statusReason: text('status_reason'),

    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    addressLine: text('address_line').notNull(),
    city: text('city').notNull(),
    note: text('note'),

    paymentMethod: webPaymentMethodEnum('payment_method').notNull(),
    paymentStatus: webPaymentStatusEnum('payment_status').notNull(),

    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    deliveryCharge: numeric('delivery_charge', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),

    courierName: text('courier_name'),
    trackingNumber: text('tracking_number'),
    courierTrackingUrl: text('courier_tracking_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('web_order_money_non_negative', sql`${t.subtotal} >= 0 and ${t.deliveryCharge} >= 0`),
    check('web_order_total_adds_up', sql`${t.total} = ${t.subtotal} + ${t.deliveryCharge}`),
    check('web_order_number_format', sql`${t.orderNumber} ~ '^WO-[0-9]{4}-[0-9]{5}$'`),
    // Once the courier has the parcel, we must know which courier and its tracking number.
    check(
      'web_order_courier_known_after_dispatch',
      sql`${t.status} not in ('handed_to_courier', 'in_transit', 'delivered', 'delivery_failed', 'returned')
          or (${t.courierName} is not null and ${t.trackingNumber} is not null)`,
    ),
    check(
      'web_order_reason_when_cancelled_or_failed',
      sql`${t.status} not in ('cancelled', 'delivery_failed') or ${t.statusReason} is not null`,
    ),
    // Card statuses only for card payments, COD statuses only for COD.
    check(
      'web_order_payment_status_matches_method',
      sql`(${t.paymentMethod} = 'card' and ${t.paymentStatus} in ('pending', 'authorised', 'settled', 'failed', 'refund_pending', 'refunded'))
          or (${t.paymentMethod} = 'cod' and ${t.paymentStatus} in ('awaiting_collection', 'collected', 'remitted', 'refund_pending', 'refunded'))`,
    ),
    index('web_order_status_idx').on(t.status),
    index('web_order_created_at_idx').on(t.createdAt),
  ],
);

/**
 * M8 — `web_order_line`: one product in a website order.
 *
 * Name and unit price are copied at the moment of ordering, so a later price change never
 * rewrites a past order (V2, section 2). Batch allocation is recorded through stock
 * reservations (M4 with M8) in a later PR.
 */
export const webOrderLines = pgTable(
  'web_order_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webOrderId: uuid('web_order_id')
      .notNull()
      .references(() => webOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    /** Retail price per unit at the moment of ordering. */
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    check('web_order_line_quantity_positive', sql`${t.quantity} > 0`),
    check('web_order_line_price_non_negative', sql`${t.unitPrice} >= 0`),
    check('web_order_line_total_adds_up', sql`${t.lineTotal} = ${t.unitPrice} * ${t.quantity}`),
    // The checkout contract allows each product only once per order.
    uniqueIndex('web_order_line_order_product_unique').on(t.webOrderId, t.productId),
    index('web_order_line_product_idx').on(t.productId),
  ],
);
