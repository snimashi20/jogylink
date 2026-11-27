import { describe, expect, it } from 'vitest';
import {
  WEB_ORDER_STATUSES,
  WebOrderCreateSchema,
  WebOrderStatusUpdateSchema,
  WebOrderTrackQuerySchema,
  canMoveWebOrder,
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
});

describe('WebOrderTrackQuerySchema (Track My Order)', () => {
  it('needs a well-formed order number and the phone used at checkout', () => {
    expect(
      WebOrderTrackQuerySchema.safeParse({ orderNumber: 'WO-2026-00042', phone: '0771234567' })
        .success,
    ).toBe(true);
    expect(
      WebOrderTrackQuerySchema.safeParse({ orderNumber: '42', phone: '0771234567' }).success,
    ).toBe(false);
  });
});
