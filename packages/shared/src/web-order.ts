import { z } from 'zod';
import { MoneySchema } from './money';

/**
 * M8 — website orders (pages W1–W8, admin page A8).
 * Individual customers pay the RETAIL price. The client never sends a price:
 * the server looks up each product and derives retail with the two-price rule.
 */

// ---------- Order status engine ----------

export const WEB_ORDER_STATUSES = [
  'new',
  'confirmed',
  'packed',
  'handed_to_courier',
  'in_transit',
  'delivered',
  'returned',
  'cancelled',
] as const;
export const WebOrderStatusSchema = z.enum(WEB_ORDER_STATUSES);
export type WebOrderStatus = z.infer<typeof WebOrderStatusSchema>;

/**
 * The only moves an order may make.
 * New -> Confirmed -> Packed -> Handed to Courier -> In Transit -> Delivered.
 * Before the courier has it, the owner can cancel. After, it can only come back as Returned.
 * Delivered, Returned and Cancelled are final.
 */
export const WEB_ORDER_TRANSITIONS: Record<WebOrderStatus, readonly WebOrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['handed_to_courier', 'cancelled'],
  handed_to_courier: ['in_transit', 'returned'],
  in_transit: ['delivered', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
};

export function canMoveWebOrder(from: WebOrderStatus, to: WebOrderStatus): boolean {
  return WEB_ORDER_TRANSITIONS[from].includes(to);
}

// ---------- Payment ----------

/** cod = Cash on Delivery (courier collects). card = PayHere (M6 owns the PayHere integration). */
export const PaymentMethodSchema = z.enum(['cod', 'card']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** For COD, payment stays pending until the owner marks the courier's cash as received. */
export const PaymentStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ---------- Shared field rules ----------

/** Sri Lankan mobile: 0771234567 or +94771234567. Order SMS updates go to this number. */
export const SriLankaMobileSchema = z
  .string()
  .trim()
  .regex(/^(?:\+94|0)7\d{8}$/, 'Enter a Sri Lankan mobile number, for example 0771234567');

/** Readable order number shown to the customer and on SMS, e.g. WO-2026-00042. */
export const WebOrderNumberSchema = z
  .string()
  .trim()
  .regex(/^WO-\d{4}-\d{5}$/, 'Order numbers look like WO-2026-00042');

// ---------- Checkout (W5) ----------

export const WebOrderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
});
export type WebOrderItemInput = z.infer<typeof WebOrderItemInputSchema>;

export const WebOrderCreateSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  phone: SriLankaMobileSchema,
  email: z.string().trim().email().max(200).nullable().optional(),
  addressLine: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).nullable().optional(),
  paymentMethod: PaymentMethodSchema,
  items: z
    .array(WebOrderItemInputSchema)
    .min(1, 'The cart is empty')
    .max(30)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: 'Each product can appear only once; change its quantity instead',
    }),
});
export type WebOrderCreate = z.infer<typeof WebOrderCreateSchema>;

// ---------- Order as the owner sees it (A8) ----------

export const WebOrderLineSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  /** Retail price per unit at the moment of ordering */
  unitPrice: MoneySchema,
  lineTotal: MoneySchema,
});
export type WebOrderLine = z.infer<typeof WebOrderLineSchema>;

export const WebOrderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: WebOrderNumberSchema,
  status: WebOrderStatusSchema,
  customerName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  addressLine: z.string(),
  city: z.string(),
  note: z.string().nullable(),
  paymentMethod: PaymentMethodSchema,
  paymentStatus: PaymentStatusSchema,
  subtotal: MoneySchema,
  deliveryCharge: MoneySchema,
  total: MoneySchema,
  courierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  lines: z.array(WebOrderLineSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type WebOrderResponse = z.infer<typeof WebOrderResponseSchema>;

export const WebOrderListQuerySchema = z.object({
  status: WebOrderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type WebOrderListQuery = z.infer<typeof WebOrderListQuerySchema>;

export const WebOrderListResponseSchema = z.object({
  items: z.array(WebOrderResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type WebOrderListResponse = z.infer<typeof WebOrderListResponseSchema>;

/** Owner moves an order on. Handing to the courier needs the courier and its tracking number. */
export const WebOrderStatusUpdateSchema = z
  .object({
    status: WebOrderStatusSchema,
    courierName: z.string().trim().min(1).max(80).optional(),
    trackingNumber: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => v.status !== 'handed_to_courier' || (v.courierName && v.trackingNumber), {
    message: 'Courier name and tracking number are required when handing to the courier',
  });
export type WebOrderStatusUpdate = z.infer<typeof WebOrderStatusUpdateSchema>;

// ---------- Track My Order (W7), no login ----------

/** Both are needed, so nobody can look up other people's orders by guessing numbers. */
export const WebOrderTrackQuerySchema = z.object({
  orderNumber: WebOrderNumberSchema,
  phone: SriLankaMobileSchema,
});
export type WebOrderTrackQuery = z.infer<typeof WebOrderTrackQuerySchema>;

/** What the public tracking page shows: no address, no customer details. */
export const WebOrderTrackResponseSchema = z.object({
  orderNumber: WebOrderNumberSchema,
  status: WebOrderStatusSchema,
  paymentMethod: PaymentMethodSchema,
  total: MoneySchema,
  courierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  updatedAt: z.coerce.date(),
});
export type WebOrderTrackResponse = z.infer<typeof WebOrderTrackResponseSchema>;
