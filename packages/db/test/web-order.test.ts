import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { products, webOrderLines, webOrders } from '../src';

// A real PostgreSQL engine running in-process, using the real migration files.
const client = new PGlite();
const db = drizzle(client);
let productId: string;
let counter = 0;

/** A valid COD order; each call gets a fresh order number and tracking token. */
function order(overrides: Partial<typeof webOrders.$inferInsert> = {}) {
  counter += 1;
  return {
    orderNumber: `WO-2026-${String(counter).padStart(5, '0')}`,
    trackingToken: `token-${counter}-abcdefghijklmnopqrstuvwxyz0123456789`,
    customerName: 'Nimali Perera',
    phone: '0771234567',
    addressLine: '12 Temple Road',
    city: 'Horana',
    paymentMethod: 'cod' as const,
    paymentStatus: 'awaiting_collection' as const,
    subtotal: '330.00',
    deliveryCharge: '350.00',
    total: '680.00',
    ...overrides,
  };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../database/migrations') });
  const [p] = await db
    .insert(products)
    .values({ sku: 'KD-250', name: 'Kalu Dodol 250g', unitType: 'piece', wholesalePrice: '150.00' })
    .returning({ id: products.id });
  productId = p!.id;
});

describe('web_order', () => {
  it('stores a valid COD order with its lines, starting as New', async () => {
    const [o] = await db.insert(webOrders).values(order()).returning();
    expect(o?.status).toBe('new');
    await db.insert(webOrderLines).values({
      webOrderId: o!.id,
      productId,
      productName: 'Kalu Dodol 250g',
      quantity: 2,
      unitPrice: '165.00',
      lineTotal: '330.00',
    });
    const lines = await db.select().from(webOrderLines).where(eq(webOrderLines.webOrderId, o!.id));
    expect(lines).toHaveLength(1);
  });

  it('rejects a total that is not subtotal + delivery charge', async () => {
    await expect(db.insert(webOrders).values(order({ total: '600.00' }))).rejects.toThrow();
  });

  it('rejects an order number in the wrong format', async () => {
    await expect(db.insert(webOrders).values(order({ orderNumber: '42' }))).rejects.toThrow();
  });

  it('rejects a payment status that belongs to the other payment method', async () => {
    await expect(
      db.insert(webOrders).values(order({ paymentMethod: 'card', paymentStatus: 'remitted' })),
    ).rejects.toThrow();
    await expect(
      db.insert(webOrders).values(order({ paymentMethod: 'cod', paymentStatus: 'settled' })),
    ).rejects.toThrow();
  });

  it('needs the courier and tracking number once the parcel is handed to the courier', async () => {
    await expect(
      db.insert(webOrders).values(order({ status: 'handed_to_courier' })),
    ).rejects.toThrow();
    await db
      .insert(webOrders)
      .values(
        order({ status: 'handed_to_courier', courierName: 'Domex', trackingNumber: 'DX123456' }),
      );
  });

  it('needs a reason to cancel or to record a failed delivery', async () => {
    await expect(db.insert(webOrders).values(order({ status: 'cancelled' }))).rejects.toThrow();
    await db
      .insert(webOrders)
      .values(order({ status: 'cancelled', statusReason: 'Customer asked to cancel' }));
  });

  it('rejects a duplicate tracking token', async () => {
    const first = order();
    await db.insert(webOrders).values(first);
    await expect(
      db.insert(webOrders).values(order({ trackingToken: first.trackingToken })),
    ).rejects.toThrow();
  });
});

describe('web_order_line', () => {
  async function newOrderId() {
    const [o] = await db.insert(webOrders).values(order()).returning({ id: webOrders.id });
    return o!.id;
  }
  const line = { productName: 'Kalu Dodol 250g', unitPrice: '165.00' };

  it('rejects a line total that is not unit price x quantity', async () => {
    const webOrderId = await newOrderId();
    await expect(
      db
        .insert(webOrderLines)
        .values({ ...line, webOrderId, productId, quantity: 2, lineTotal: '300.00' }),
    ).rejects.toThrow();
  });

  it('rejects zero quantity and the same product twice in one order', async () => {
    const webOrderId = await newOrderId();
    await expect(
      db
        .insert(webOrderLines)
        .values({ ...line, webOrderId, productId, quantity: 0, lineTotal: '0.00' }),
    ).rejects.toThrow();
    await db
      .insert(webOrderLines)
      .values({ ...line, webOrderId, productId, quantity: 1, lineTotal: '165.00' });
    await expect(
      db
        .insert(webOrderLines)
        .values({ ...line, webOrderId, productId, quantity: 1, lineTotal: '165.00' }),
    ).rejects.toThrow();
  });

  it('deletes the lines when their order is deleted', async () => {
    const webOrderId = await newOrderId();
    await db
      .insert(webOrderLines)
      .values({ ...line, webOrderId, productId, quantity: 1, lineTotal: '165.00' });
    await db.delete(webOrders).where(eq(webOrders.id, webOrderId));
    const left = await db
      .select()
      .from(webOrderLines)
      .where(eq(webOrderLines.webOrderId, webOrderId));
    expect(left).toHaveLength(0);
  });
});
