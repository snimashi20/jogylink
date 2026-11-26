import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creditEntries } from '@jogylink/db';
import {
  AgeingReportResponseSchema,
  CreditSummaryResponseSchema,
  ShopLedgerResponseSchema,
} from '@jogylink/shared';
import { CreditService } from '../src/credit/credit.service';
import { bearer, createTestApp, type TestApp } from './helpers/test-app';

let t: TestApp;
let credit: CreditService;
let ownerToken: string;
let workerToken: string;

let shopCount = 0;

/**
 * A fresh shop per test, so one test's ledger cannot change another's figures.
 * `creditLimit` is in rupees, like the rest of the API.
 */
async function newShop(creditLimit = 5000): Promise<string> {
  shopCount += 1;
  const res = await t.http
    .post('/api/shops')
    .set(bearer(ownerToken))
    .send({
      code: `S${String(shopCount).padStart(4, '0')}`,
      name: `Shop ${shopCount}`,
      creditLimit,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

beforeAll(async () => {
  t = await createTestApp();
  credit = t.moduleRef.get(CreditService);
  ownerToken = await t.ownerToken();
  workerToken = await t.workerToken();
});

afterAll(() => t.close());

describe('who may see the ledger', () => {
  it('needs a login', async () => {
    expect((await t.http.get('/api/credit/summary')).status).toBe(401);
  });

  it('is the owner only — the worker bills, the owner manages credit', async () => {
    const res = await t.http.get('/api/credit/summary').set(bearer(workerToken));
    expect(res.status).toBe(403);
  });
});

describe('recording a payment', () => {
  it('reduces what the shop owes and appears on the statement', async () => {
    const shopId = await newShop();
    await credit.recordSale({
      shopId,
      amountCents: 80000,
      sourceUuid: `sale-${shopId}`,
      saleUuid: `sale-${shopId}`,
      occurredAt: day('2026-11-01'),
    });

    const res = await t.http
      .post('/api/credit/payments')
      .set(bearer(ownerToken))
      .send({ shopId, amount: 500, sourceUuid: `pay-${shopId}`, note: 'Collected in person' });

    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(300); // 800 billed − 500 paid
    expect(res.body.entry.kind).toBe('payment');
    expect(res.body.entry.amount).toBe(-500); // stored as a negative movement

    const ledger = await t.http.get(`/api/credit/shops/${shopId}`).set(bearer(ownerToken));
    const parsed = ShopLedgerResponseSchema.parse(ledger.body);
    expect(parsed.balance).toBe(300);
    expect(parsed.entries.map((e) => e.kind)).toEqual(['payment', 'sale']); // newest first
    expect(parsed.entries.find((e) => e.kind === 'payment')?.note).toBe('Collected in person');
  });

  it('posts nothing the second time the same payment arrives', async () => {
    const shopId = await newShop();
    await credit.recordSale({
      shopId,
      amountCents: 80000,
      sourceUuid: `sale-dup-${shopId}`,
      occurredAt: day('2026-11-01'),
    });

    const body = { shopId, amount: 500, sourceUuid: `pay-dup-${shopId}` };
    const first = await t.http.post('/api/credit/payments').set(bearer(ownerToken)).send(body);
    const second = await t.http.post('/api/credit/payments').set(bearer(ownerToken)).send(body);

    expect(first.body.entry).not.toBeNull();
    // The retry is not an error: it reports the balance and changes nothing.
    expect(second.status).toBe(201);
    expect(second.body.entry).toBeNull();
    expect(second.body.balance).toBe(300);

    const rows = await t.db.select().from(creditEntries);
    expect(rows.filter((r) => r.sourceUuid === body.sourceUuid)).toHaveLength(1);
  });

  it('refuses a payment of zero or a negative amount', async () => {
    const shopId = await newShop();
    for (const amount of [0, -100]) {
      const res = await t.http
        .post('/api/credit/payments')
        .set(bearer(ownerToken))
        .send({ shopId, amount, sourceUuid: `bad-${shopId}-${amount}` });
      expect(res.status).toBe(400);
    }
  });

  it('refuses a payment against a shop that does not exist', async () => {
    const res = await t.http.post('/api/credit/payments').set(bearer(ownerToken)).send({
      shopId: '11111111-1111-4111-8111-111111111111',
      amount: 100,
      sourceUuid: 'pay-nobody',
    });
    expect(res.status).toBe(404);
  });
});

describe('a visit from the van, as the receipt describes it', () => {
  it('bills, credits a return, takes part payment and leaves the right balance', async () => {
    const shopId = await newShop();

    // Previous balance 1,200 from an earlier visit.
    await credit.recordSale({
      shopId,
      amountCents: 120000,
      sourceUuid: `old-${shopId}`,
      occurredAt: day('2026-10-01'),
    });
    // This visit: buys 800, returns 150, pays 500.
    await credit.recordSale({
      shopId,
      amountCents: 80000,
      sourceUuid: `new-${shopId}`,
      saleUuid: `new-${shopId}`,
      occurredAt: day('2026-11-20'),
    });
    await credit.recordReturn({
      shopId,
      amountCents: 15000,
      sourceUuid: `ret-${shopId}`,
      saleUuid: `new-${shopId}`,
      occurredAt: day('2026-11-20'),
    });
    await credit.recordPayment({
      shopId,
      amountCents: 50000,
      sourceUuid: `pay-${shopId}`,
      occurredAt: day('2026-11-20'),
    });

    const res = await t.http.get(`/api/credit/shops/${shopId}`).set(bearer(ownerToken));
    const ledger = ShopLedgerResponseSchema.parse(res.body);

    // 1,200 + (800 − 150) − 500 = 1,350
    expect(ledger.balance).toBe(1350);

    // The statement reads as a running balance, newest first.
    const oldestFirst = [...ledger.entries].reverse();
    expect(oldestFirst.map((e) => [e.kind, e.amount, e.runningBalance])).toEqual([
      ['sale', 1200, 1200],
      ['sale', 800, 2000],
      ['return', -150, 1850],
      ['payment', -500, 1350],
    ]);
  });

  it('gives a credit sale a due date from the agreed term, and nothing else one', async () => {
    const shopId = await newShop();
    await credit.recordSale({
      shopId,
      amountCents: 10000,
      sourceUuid: `due-${shopId}`,
      occurredAt: day('2026-11-26'),
    });
    await credit.recordPayment({
      shopId,
      amountCents: 1000,
      sourceUuid: `due-pay-${shopId}`,
      occurredAt: day('2026-11-26'),
    });

    const res = await t.http.get(`/api/credit/shops/${shopId}`).set(bearer(ownerToken));
    const ledger = ShopLedgerResponseSchema.parse(res.body);

    const sale = ledger.entries.find((e) => e.kind === 'sale');
    const payment = ledger.entries.find((e) => e.kind === 'payment');
    expect(sale?.dueDate).toEqual(day('2026-12-26')); // the default 30-day term
    expect(payment?.dueDate).toBeNull();
  });

  it('says when a shop has gone past the credit limit the owner set', async () => {
    const shopId = await newShop(500); // a credit limit of Rs 500
    await credit.recordSale({
      shopId,
      amountCents: 80000,
      sourceUuid: `over-${shopId}`,
      occurredAt: day('2026-11-01'),
    });

    const res = await t.http.get(`/api/credit/shops/${shopId}`).set(bearer(ownerToken));
    expect(res.body.overLimit).toBe(true);
    expect(res.body.creditLimit).toBe(500);
  });

  it('has an empty statement for a shop that has never bought anything', async () => {
    const shopId = await newShop();
    const res = await t.http.get(`/api/credit/shops/${shopId}`).set(bearer(ownerToken));
    const ledger = ShopLedgerResponseSchema.parse(res.body);
    expect(ledger.balance).toBe(0);
    expect(ledger.entries).toEqual([]);
    expect(ledger.overLimit).toBe(false);
  });

  it('refuses a statement for a shop that does not exist', async () => {
    const res = await t.http
      .get('/api/credit/shops/11111111-1111-4111-8111-111111111111')
      .set(bearer(ownerToken));
    expect(res.status).toBe(404);
  });
});

describe('the dashboard widgets and the ageing report', () => {
  it('counts what is outstanding and what is overdue', async () => {
    const overdue = await newShop();
    const current = await newShop();

    await credit.recordSale({
      shopId: overdue,
      amountCents: 60000,
      sourceUuid: `age-old-${overdue}`,
      occurredAt: day('2026-01-10'), // long past its 30-day term
    });
    await credit.recordSale({
      shopId: current,
      amountCents: 40000,
      sourceUuid: `age-new-${current}`,
      occurredAt: new Date(), // not due yet
    });

    const res = await t.http.get('/api/credit/summary').set(bearer(ownerToken));
    const summary = CreditSummaryResponseSchema.parse(res.body);

    expect(summary.totalOutstanding).toBeGreaterThanOrEqual(1000);
    expect(summary.shopsOwing).toBeGreaterThanOrEqual(2);
    expect(summary.overdueShops).toBeGreaterThanOrEqual(1);
    expect(summary.overdueOutstanding).toBeGreaterThanOrEqual(600);
  });

  it('ages each shop and totals the buckets', async () => {
    const shopId = await newShop();
    await credit.recordSale({
      shopId,
      amountCents: 90000,
      sourceUuid: `rep-${shopId}`,
      occurredAt: day('2026-06-01'),
    });

    const res = await t.http.get('/api/credit/ageing').set(bearer(ownerToken));
    const report = AgeingReportResponseSchema.parse(res.body);

    const row = report.shops.find((s) => s.shopId === shopId);
    expect(row?.outstanding).toBe(900);
    expect(row?.buckets.days_90_plus).toBe(900);
    expect(row?.oldestOverdueDays).toBeGreaterThan(90);
    expect(report.totals.days_90_plus).toBeGreaterThanOrEqual(900);
    // Worst first: this is a list for deciding who to chase.
    const amounts = report.shops.map((s) => s.outstanding);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it('leaves a shop that has paid everything off the report', async () => {
    const shopId = await newShop();
    await credit.recordSale({
      shopId,
      amountCents: 30000,
      sourceUuid: `settled-${shopId}`,
      occurredAt: day('2026-06-01'),
    });
    await credit.recordPayment({
      shopId,
      amountCents: 30000,
      sourceUuid: `settled-pay-${shopId}`,
      occurredAt: day('2026-06-15'),
    });

    const res = await t.http.get('/api/credit/ageing').set(bearer(ownerToken));
    expect(res.body.shops.map((s: { shopId: string }) => s.shopId)).not.toContain(shopId);
  });
});

describe('what the database itself refuses', () => {
  it('will not store a payment that increases a debt', async () => {
    const shopId = await newShop();
    // Straight past the service, to prove the invariant is in the schema and not just in code.
    await expect(
      t.db.insert(creditEntries).values({
        shopId,
        kind: 'payment',
        amount: '500.00', // positive: a payment that adds to what the shop owes
        sourceUuid: `bad-sign-${shopId}`,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('will not store a movement of nothing', async () => {
    const shopId = await newShop();
    await expect(
      t.db.insert(creditEntries).values({
        shopId,
        kind: 'adjustment',
        amount: '0.00',
        sourceUuid: `zero-${shopId}`,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('will not store two entries for the same event', async () => {
    const shopId = await newShop();
    const values = {
      shopId,
      kind: 'sale' as const,
      amount: '100.00',
      sourceUuid: `once-${shopId}`,
      occurredAt: new Date(),
    };
    await t.db.insert(creditEntries).values(values);
    await expect(t.db.insert(creditEntries).values(values)).rejects.toThrow();
  });

  it('will not put a due date on anything but a sale', async () => {
    const shopId = await newShop();
    await expect(
      t.db.insert(creditEntries).values({
        shopId,
        kind: 'payment',
        amount: '-100.00',
        sourceUuid: `due-on-payment-${shopId}`,
        dueDate: day('2026-12-26'),
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
