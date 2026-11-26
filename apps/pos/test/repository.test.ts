import { beforeEach, describe, expect, it } from 'vitest';
import { Outbox } from '../src/storage/outbox';
import type { CachedShop, PaymentInput, ReturnInput, SaleInput } from '../src/storage/records';
import { SqlitePosRepository, type PosRepository } from '../src/storage/repository';
import { migrateLocalDatabase } from '../src/storage/schema';
import type { SqliteDriver } from '../src/storage/types';
import { memorySqlite } from './memory-sqlite';

const START = Date.UTC(2026, 10, 26, 8, 0, 0);

function clock(start = START) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function sale(overrides: Partial<SaleInput> = {}): SaleInput {
  return {
    uuid: 'sale-1',
    shopId: 'shop-1',
    userId: 'worker-1',
    soldAt: new Date(START),
    totalCents: 15000,
    lines: [
      {
        productId: 'product-1',
        batchId: 'batch-1',
        unitType: 'piece',
        quantity: 3,
        unitPriceCents: 5000,
        lineTotalCents: 15000,
      },
    ],
    ...overrides,
  };
}

/** One line adding up to exactly the given total, so the sale passes its own arithmetic check. */
function lineFor(totalCents: number): SaleInput['lines'] {
  return [
    {
      productId: 'product-1',
      batchId: null,
      unitType: 'piece',
      quantity: 1,
      unitPriceCents: totalCents,
      lineTotalCents: totalCents,
    },
  ];
}

function payment(overrides: Partial<PaymentInput> = {}): PaymentInput {
  return {
    uuid: 'payment-1',
    shopId: 'shop-1',
    amountCents: 5000,
    method: 'cash',
    receivedAt: new Date(START),
    ...overrides,
  };
}

function shopReturn(overrides: Partial<ReturnInput> = {}): ReturnInput {
  return {
    uuid: 'return-1',
    shopId: 'shop-1',
    productId: 'product-1',
    returnUnit: 'piece',
    quantityReturned: 1,
    isPartial: false,
    creditCents: 5000,
    photoPath: 'file:///photos/return-1.jpg',
    returnedAt: new Date(START),
    ...overrides,
  };
}

function cachedShop(overrides: Partial<CachedShop> = {}): CachedShop {
  return {
    id: 'shop-1',
    code: 'S001',
    name: 'Lanka Stores',
    creditLimitCents: 500000,
    routeId: 'route-1',
    visitOrder: 1,
    isActive: true,
    serverBalanceCents: 0,
    ...overrides,
  };
}

describe('POS repository', () => {
  let db: SqliteDriver;
  let time: ReturnType<typeof clock>;
  let outbox: Outbox;
  let repo: PosRepository;

  beforeEach(async () => {
    db = memorySqlite();
    await migrateLocalDatabase(db);
    time = clock();
    outbox = new Outbox(db, { now: time.now });
    repo = new SqlitePosRepository(db, { now: time.now, outbox });
  });

  describe('saving a sale', () => {
    it('stores the sale, its lines and one outbox event', async () => {
      await repo.saveSale(
        sale({
          totalCents: 23000,
          lines: [
            {
              productId: 'product-1',
              batchId: 'batch-1',
              unitType: 'piece',
              quantity: 2,
              unitPriceCents: 5000,
              lineTotalCents: 10000,
            },
            {
              productId: 'product-2',
              batchId: null,
              unitType: 'weight',
              quantity: 2600,
              unitPriceCents: 5000,
              lineTotalCents: 13000,
            },
          ],
        }),
      );

      const stored = await repo.getSale('sale-1');
      expect(stored?.totalCents).toBe(23000);
      expect(stored?.soldAt).toEqual(new Date(START));
      expect(stored?.syncedAt).toBeNull();
      expect(stored?.lines.map((l) => l.productId)).toEqual(['product-1', 'product-2']);
      // Grams for a weight product, kept as a whole number.
      expect(stored?.lines[1]?.quantity).toBe(2600);

      expect(await outbox.pendingCount()).toBe(1);
    });

    it('puts the event on the wire with ISO dates and numbered lines', async () => {
      await repo.saveSale(sale());

      const [event] = await outbox.pending();
      expect(event?.type).toBe('sale');
      expect(event?.payload).toEqual({
        v: 1,
        uuid: 'sale-1',
        shopId: 'shop-1',
        userId: 'worker-1',
        soldAt: '2026-11-26T08:00:00.000Z',
        totalCents: 15000,
        note: null,
        lines: [
          {
            lineNo: 1,
            productId: 'product-1',
            batchId: 'batch-1',
            unitType: 'piece',
            quantity: 3,
            unitPriceCents: 5000,
            lineTotalCents: 15000,
          },
        ],
      });
    });

    it('ignores the same sale saved twice, so a double tap bills the shop once', async () => {
      await repo.saveSale(sale());
      // The same uuid again, with different figures — a retry must not revise a recorded fact.
      await repo.saveSale(sale({ totalCents: 99999, lines: lineFor(99999) }));

      const stored = await repo.getSale('sale-1');
      expect(stored?.totalCents).toBe(15000); // the first record stands
      expect(stored?.lines).toHaveLength(1); // the lines are not appended again
      expect(await outbox.pendingCount()).toBe(1);
      expect(await repo.getBalance('shop-1')).toBe(15000);
    });

    it('records cash taken at the shop as its own event, in the same transaction', async () => {
      await repo.saveSale(sale({ payment: payment({ amountCents: 5000 }) }));

      const pending = await outbox.pending();
      expect(pending.map((e) => e.type)).toEqual(['sale', 'payment']);
      // Billed 150.00, paid 50.00, so 100.00 is still owed.
      expect(await repo.getBalance('shop-1')).toBe(10000);
    });

    it('writes nothing at all if any part of the write fails', async () => {
      const failing = failOn(db, (sql) => sql.includes('INSERT INTO sale_line'));
      const brittle = new SqlitePosRepository(failing, { now: time.now });

      await expect(brittle.saveSale(sale())).rejects.toThrow('disk full');

      // No half-written sale, and nothing queued to send either.
      expect(await repo.getSale('sale-1')).toBeNull();
      expect(await outbox.pendingCount()).toBe(0);
    });

    describe('refusing a bill that does not add up', () => {
      it('rejects a total that disagrees with the lines', async () => {
        await expect(repo.saveSale(sale({ totalCents: 14000 }))).rejects.toThrow(
          /does not match its lines/,
        );
        expect(await outbox.pendingCount()).toBe(0);
      });

      it('rejects rupees passed where cents were expected', async () => {
        await expect(repo.saveSale(sale({ totalCents: 150.5 }))).rejects.toThrow(/whole number/);
      });

      it('rejects a sale with no lines', async () => {
        await expect(repo.saveSale(sale({ lines: [], totalCents: 0 }))).rejects.toThrow(
          /at least one line/,
        );
      });

      it('rejects a quantity of zero or a fraction', async () => {
        const bad = (quantity: number) =>
          sale({
            totalCents: 0,
            lines: [
              {
                productId: 'p',
                unitType: 'piece',
                quantity,
                unitPriceCents: 0,
                lineTotalCents: 0,
              },
            ],
          });
        await expect(repo.saveSale(bad(0))).rejects.toThrow(/positive whole quantity/);
        await expect(repo.saveSale(bad(1.5))).rejects.toThrow(/positive whole quantity/);
      });

      it('rejects cash recorded against a different shop', async () => {
        await expect(
          repo.saveSale(sale({ payment: payment({ shopId: 'shop-2' }) })),
        ).rejects.toThrow(/same shop/);
      });
    });
  });

  describe('payments and returns', () => {
    it('reduces what the shop owes', async () => {
      await repo.saveSale(sale({ totalCents: 15000 }));
      await repo.savePayment(payment({ amountCents: 4000 }));
      await repo.saveReturn(shopReturn({ creditCents: 1000 }));

      expect(await repo.getBalance('shop-1')).toBe(10000);
      expect(await outbox.pendingCount()).toBe(3);
    });

    it('keeps the return photo path, so the evidence survives until it is uploaded', async () => {
      await repo.saveReturn(shopReturn());
      const [row] = await db.all<{ photo_path: string; is_partial: number }>(
        'SELECT photo_path, is_partial FROM "return" WHERE uuid = ?',
        ['return-1'],
      );
      expect(row?.photo_path).toBe('file:///photos/return-1.jpg');
      expect(row?.is_partial).toBe(0);
    });

    it('ignores a return saved twice', async () => {
      await repo.saveReturn(shopReturn());
      await repo.saveReturn(shopReturn({ creditCents: 99999 }));
      expect(await repo.getBalance('shop-1')).toBe(-5000);
      expect(await outbox.pendingCount()).toBe(1);
    });

    it('refuses a payment of nothing and an unknown method', async () => {
      await expect(repo.savePayment(payment({ amountCents: 0 }))).rejects.toThrow(/not a payment/);
      await expect(
        repo.savePayment(payment({ method: 'bitcoin' as PaymentInput['method'] })),
      ).rejects.toThrow(/Unknown payment method/);
    });
  });

  describe('what a shop owes', () => {
    it('is zero for a shop nobody has dealt with', async () => {
      expect(await repo.getBalance('unknown-shop')).toBe(0);
    });

    it('adds unsent events to the balance the server last reported', async () => {
      await repo.applySyncResult({
        acceptedUuids: [],
        shops: [cachedShop({ serverBalanceCents: 20000 })],
      });

      await repo.saveSale(sale({ totalCents: 15000 }));
      expect(await repo.getBalance('shop-1')).toBe(35000);
    });

    it('counts a sale once, not twice, when the server confirms it', async () => {
      await repo.applySyncResult({
        acceptedUuids: [],
        shops: [cachedShop({ serverBalanceCents: 20000 })],
      });
      await repo.saveSale(sale({ totalCents: 15000 }));
      const before = await repo.getBalance('shop-1');

      // The sync confirms the sale and brings back the server's new balance, which now includes
      // it. Both land in one transaction, so the sale is never counted on both sides.
      time.advance(60_000);
      await repo.applySyncResult({
        acceptedUuids: ['sale-1'],
        shops: [cachedShop({ serverBalanceCents: 35000 })],
      });

      expect(await repo.getBalance('shop-1')).toBe(before);
      expect(await outbox.pendingCount()).toBe(0);
    });

    it("keeps each shop's events to itself", async () => {
      await repo.saveSale(sale({ uuid: 'a', shopId: 'shop-1', totalCents: 15000 }));
      await repo.saveSale(
        sale({ uuid: 'b', shopId: 'shop-2', totalCents: 7000, lines: lineFor(7000) }),
      );

      expect(await repo.getBalance('shop-1')).toBe(15000);
      expect(await repo.getBalance('shop-2')).toBe(7000);
    });
  });

  describe('the route list', () => {
    beforeEach(async () => {
      await repo.applySyncResult({
        acceptedUuids: [],
        shops: [
          cachedShop({ id: 'shop-2', code: 'S002', name: 'Second stop', visitOrder: 2 }),
          cachedShop({ id: 'shop-1', code: 'S001', name: 'First stop', visitOrder: 1 }),
          cachedShop({ id: 'shop-9', code: 'S009', name: 'Other route', routeId: 'route-2' }),
          cachedShop({ id: 'shop-8', code: 'S008', name: 'Switched off', isActive: false }),
        ],
      });
    });

    it('comes back in visit order, this route only, without switched-off shops', async () => {
      const shops = await repo.getRouteShops('route-1');
      expect(shops.map((s) => s.id)).toEqual(['shop-1', 'shop-2']);
      expect(shops[0]?.name).toBe('First stop');
      expect(shops[0]?.creditLimitCents).toBe(500000);
    });

    it('shows the balance including what has not been sent yet', async () => {
      await repo.saveSale(sale({ shopId: 'shop-2', totalCents: 15000 }));

      const shops = await repo.getRouteShops('route-1');
      expect(shops.find((s) => s.id === 'shop-2')?.balanceCents).toBe(15000);
      expect(shops.find((s) => s.id === 'shop-2')?.serverBalanceCents).toBe(0);
      expect(shops.find((s) => s.id === 'shop-1')?.balanceCents).toBe(0);
    });

    it('is empty for a route with no shops cached', async () => {
      expect(await repo.getRouteShops('route-nobody')).toEqual([]);
    });
  });

  describe('the cached price list', () => {
    it('gives billing the active products by name, with wholesale prices only', async () => {
      await repo.applySyncResult({
        acceptedUuids: [],
        products: [
          {
            id: 'p2',
            sku: 'B',
            name: 'Biscuits',
            unitType: 'piece',
            wholesalePriceCents: 5000,
            active: true,
          },
          {
            id: 'p1',
            sku: 'A',
            name: 'Aluwa',
            unitType: 'weight',
            wholesalePriceCents: 9000,
            active: true,
          },
          {
            id: 'p3',
            sku: 'C',
            name: 'Discontinued',
            unitType: 'piece',
            wholesalePriceCents: 1,
            active: false,
          },
        ],
      });

      const products = await repo.getProducts();
      expect(products.map((p) => p.name)).toEqual(['Aluwa', 'Biscuits']);
      expect(products[0]?.unitType).toBe('weight');
      expect(products[0]?.wholesalePriceCents).toBe(9000);
    });

    it('updates a cached row in place rather than duplicating it', async () => {
      const product = {
        id: 'p1',
        sku: 'A',
        name: 'Aluwa',
        unitType: 'weight' as const,
        wholesalePriceCents: 9000,
        active: true,
      };
      await repo.applySyncResult({ acceptedUuids: [], products: [product] });
      await repo.applySyncResult({
        acceptedUuids: [],
        products: [{ ...product, wholesalePriceCents: 9500 }],
      });

      const products = await repo.getProducts();
      expect(products).toHaveLength(1);
      expect(products[0]?.wholesalePriceCents).toBe(9500);
    });
  });

  describe('sync status', () => {
    it('reports what is still unsent and when the server last confirmed anything', async () => {
      expect(await repo.getSyncStatus()).toEqual({
        pending: 0,
        needsAttention: 0,
        lastSyncedAt: null,
      });

      await repo.saveSale(sale());
      expect(await repo.getSyncStatus()).toEqual({
        pending: 1,
        needsAttention: 0,
        lastSyncedAt: null,
      });

      time.advance(30_000);
      await repo.applySyncResult({ acceptedUuids: ['sale-1'] });
      expect(await repo.getSyncStatus()).toEqual({
        pending: 0,
        needsAttention: 0,
        lastSyncedAt: new Date(START + 30_000),
      });
    });

    it('marks a confirmed sale as synced when it is reprinted', async () => {
      await repo.saveSale(sale());
      time.advance(30_000);
      await repo.applySyncResult({ acceptedUuids: ['sale-1'] });

      expect((await repo.getSale('sale-1'))?.syncedAt).toEqual(new Date(START + 30_000));
    });
  });

  it('has no sale to reprint for a uuid it has never seen', async () => {
    expect(await repo.getSale('never-happened')).toBeNull();
  });
});

/** A driver that fails on one statement, to prove a half-written sale cannot survive. */
function failOn(db: SqliteDriver, matches: (sql: string) => boolean): SqliteDriver {
  return {
    ...db,
    run: async (sql, params) => {
      if (matches(sql)) throw new Error('disk full');
      return db.run(sql, params);
    },
  };
}
