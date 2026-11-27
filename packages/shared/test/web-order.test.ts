import { describe, expect, it } from 'vitest';
import {
  WEB_ORDER_STATUSES,
  WebOrderCreateSchema,
  WebOrderStatusUpdateSchema,
  WebOrderTrackQuerySchema,
  canMoveWebOrder,
  initialPaymentStatus,
  isPaymentStatusValidFor,
} from '../src';

const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';

const validOrder = {
  customerName: 'Nimali Perera',
  phone: '0771234567',
  addressLine: '12 Temple Road',
  city: 'Horana',
  paymentMethod: 'cod',
  items: [
    { productId: PRODUCT_A, quantity: 2 },
    { productId: PRODUCT_B, quantity: 1 },
  ],
};

describe('web order status engine', () => {
  it('follows New -> Confirmed -> Packed -> Handed to Courier -> In Transit -> Delivered', () => {
    expect(canMoveWebOrder('new', 'confirmed')).toBe(true);
    expect(canMoveWebOrder('confirmed', 'packed')).toBe(true);
    expect(canMoveWebOrder('packed', 'handed_to_courier')).toBe(true);
    expect(canMoveWebOrder('handed_to_courier', 'in_transit')).toBe(true);
    expect(canMoveWebOrder('in_transit', 'delivered')).toBe(true);
  });

  it('refuses skipping steps and going backwards', () => {
    expect(canMoveWebOrder('new', 'delivered')).toBe(false);
    expect(canMoveWebOrder('packed', 'confirmed')).toBe(false);
  });

  it('allows cancelling only before the courier has the parcel', () => {
    expect(canMoveWebOrder('packed', 'cancelled')).toBe(true);
    expect(canMoveWebOrder('in_transit', 'cancelled')).toBe(false);
    expect(canMoveWebOrder('in_transit', 'returned')).toBe(true);
  });

  it('lets a failed delivery be re-attempted or returned, but not cancelled', () => {
    expect(canMoveWebOrder('in_transit', 'delivery_failed')).toBe(true);
    expect(canMoveWebOrder('delivery_failed', 'in_transit')).toBe(true);
    expect(canMoveWebOrder('delivery_failed', 'returned')).toBe(true);
    expect(canMoveWebOrder('delivery_failed', 'cancelled')).toBe(false);
    expect(canMoveWebOrder('delivery_failed', 'delivered')).toBe(false);
  });

  it('treats delivered, returned and cancelled as final', () => {
    for (const to of WEB_ORDER_STATUSES) {
      expect(canMoveWebOrder('delivered', to)).toBe(false);
      expect(canMoveWebOrder('returned', to)).toBe(false);
      expect(canMoveWebOrder('cancelled', to)).toBe(false);
    }
  });
});

describe('WebOrderCreateSchema (checkout)', () => {
  it('accepts a valid COD order', () => {
    expect(WebOrderCreateSchema.safeParse(validOrder).success).toBe(true);
  });

  it('accepts both Sri Lankan mobile formats and rejects others', () => {
    expect(WebOrderCreateSchema.safeParse({ ...validOrder, phone: '+94771234567' }).success).toBe(
      true,
    );
    expect(WebOrderCreateSchema.safeParse({ ...validOrder, phone: '0112345678' }).success).toBe(
      false,
    );
    expect(WebOrderCreateSchema.safeParse({ ...validOrder, phone: '077123' }).success).toBe(false);
  });

  it('rejects an empty cart, zero quantities and the same product twice', () => {
    expect(WebOrderCreateSchema.safeParse({ ...validOrder, items: [] }).success).toBe(false);
    expect(
      WebOrderCreateSchema.safeParse({
        ...validOrder,
        items: [{ productId: PRODUCT_A, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      WebOrderCreateSchema.safeParse({
        ...validOrder,
        items: [
          { productId: PRODUCT_A, quantity: 1 },
          { productId: PRODUCT_A, quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it('never takes a price from the customer', () => {
    const parsed = WebOrderCreateSchema.parse({
      ...validOrder,
      items: [{ productId: PRODUCT_A, quantity: 1, unitPrice: 1 }],
    });
    expect(parsed.items[0]).not.toHaveProperty('unitPrice');
  });
});

describe('WebOrderStatusUpdateSchema', () => {
  it('needs courier and tracking number when handing to the courier', () => {
    expect(WebOrderStatusUpdateSchema.safeParse({ status: 'handed_to_courier' }).success).toBe(
      false,
    );
    expect(
      WebOrderStatusUpdateSchema.safeParse({
        status: 'handed_to_courier',
        courierName: 'Domex',
        trackingNumber: 'DX123456',
      }).success,
    ).toBe(true);
    expect(WebOrderStatusUpdateSchema.safeParse({ status: 'confirmed' }).success).toBe(true);
  });

  it('needs a reason to cancel or to record a failed delivery', () => {
    expect(WebOrderStatusUpdateSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
    expect(WebOrderStatusUpdateSchema.safeParse({ status: 'delivery_failed' }).success).toBe(false);
    expect(
      WebOrderStatusUpdateSchema.safeParse({ status: 'cancelled', reason: 'Customer asked' })
        .success,
    ).toBe(true);
  });
});

describe('payment status (separate from order status)', () => {
  it('starts card payments as pending and COD as awaiting collection', () => {
    expect(initialPaymentStatus('card')).toBe('pending');
    expect(initialPaymentStatus('cod')).toBe('awaiting_collection');
  });

  it('only allows statuses that belong to the payment method', () => {
    expect(isPaymentStatusValidFor('card', 'settled')).toBe(true);
    expect(isPaymentStatusValidFor('card', 'remitted')).toBe(false);
    expect(isPaymentStatusValidFor('cod', 'remitted')).toBe(true);
    expect(isPaymentStatusValidFor('cod', 'authorised')).toBe(false);
  });
});

describe('WebOrderTrackQuerySchema (Track My Order)', () => {
  it('accepts a long random tracking token from the SMS link', () => {
    expect(
      WebOrderTrackQuerySchema.safeParse({ token: 'k3J9xQ2mZr7Lw1Vt8Bn4Yc6Hd0Fs5Ga2Pe' }).success,
    ).toBe(true);
  });

  it('rejects an order number, because order-number-only lookup is not allowed', () => {
    expect(WebOrderTrackQuerySchema.safeParse({ token: 'WO-2026-00042' }).success).toBe(false);
    expect(WebOrderTrackQuerySchema.safeParse({ token: 'short' }).success).toBe(false);
  });
});
