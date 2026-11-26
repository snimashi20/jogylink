import { describe, expect, it } from 'vitest';
import {
  ageOutstanding,
  balanceFromEntries,
  bucketFor,
  daysBetween,
  dueDateFor,
  isValidEntryAmount,
  receiptTotals,
  toCents,
} from '../src';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('the receipt calculation', () => {
  it("follows the owner's three lines exactly", () => {
    // Previous 1,200.00; buys 800.00; returns 150.00; pays 500.00
    const totals = receiptTotals({
      previousBalanceCents: 120000,
      goodsCents: 80000,
      returnsCents: 15000,
      paidCents: 50000,
    });

    expect(totals.netBillCents).toBe(65000); // 800 − 150
    expect(totals.totalDueCents).toBe(185000); // 1,200 + 650
    expect(totals.outstandingCents).toBe(135000); // 1,850 − 500
  });

  it('handles a full cash sale, leaving nothing owed', () => {
    const totals = receiptTotals({
      previousBalanceCents: 0,
      goodsCents: 45000,
      returnsCents: 0,
      paidCents: 45000,
    });
    expect(totals.outstandingCents).toBe(0);
  });

  it('handles a full credit sale, where nothing is paid', () => {
    const totals = receiptTotals({
      previousBalanceCents: 20000,
      goodsCents: 45000,
      returnsCents: 0,
      paidCents: 0,
    });
    expect(totals.outstandingCents).toBe(65000);
  });

  it('handles a partial payment', () => {
    const totals = receiptTotals({
      previousBalanceCents: 0,
      goodsCents: 45000,
      returnsCents: 0,
      paidCents: 20000,
    });
    expect(totals.outstandingCents).toBe(25000);
  });

  it('lets a return exceed the purchase, putting the shop in credit', () => {
    const totals = receiptTotals({
      previousBalanceCents: 0,
      goodsCents: 10000,
      returnsCents: 25000,
      paidCents: 0,
    });
    expect(totals.netBillCents).toBe(-15000);
    expect(totals.outstandingCents).toBe(-15000);
  });

  it('carries a shop already in credit into the next visit', () => {
    const totals = receiptTotals({
      previousBalanceCents: -5000,
      goodsCents: 20000,
      returnsCents: 0,
      paidCents: 0,
    });
    expect(totals.totalDueCents).toBe(15000);
  });

  it('refuses rupees where cents were expected', () => {
    expect(() =>
      receiptTotals({
        previousBalanceCents: 0,
        goodsCents: 450.5,
        returnsCents: 0,
        paidCents: 0,
      }),
    ).toThrow(/whole number of cents/);
  });

  it('refuses a negative purchase, return or payment', () => {
    const base = { previousBalanceCents: 0, goodsCents: 0, returnsCents: 0, paidCents: 0 };
    expect(() => receiptTotals({ ...base, goodsCents: -1 })).toThrow(/cannot be negative/);
    expect(() => receiptTotals({ ...base, returnsCents: -1 })).toThrow(/cannot be negative/);
    expect(() => receiptTotals({ ...base, paidCents: -1 })).toThrow(/cannot be negative/);
  });

  it('adds up a month of visits without losing a cent', () => {
    // 1,234.56 billed and 999.99 paid, thirty times over.
    const entries = Array.from({ length: 30 }, () => [toCents(1234.56), -toCents(999.99)]).flat();
    expect(balanceFromEntries(entries)).toBe(30 * (123456 - 99999));
    expect(balanceFromEntries(entries)).toBe(703710);
  });
});

describe('which way a ledger entry may point', () => {
  it('only lets a sale increase a debt and a payment reduce it', () => {
    expect(isValidEntryAmount('sale', 15000)).toBe(true);
    expect(isValidEntryAmount('sale', -15000)).toBe(false);
    expect(isValidEntryAmount('payment', -15000)).toBe(true);
    expect(isValidEntryAmount('payment', 15000)).toBe(false);
    expect(isValidEntryAmount('return', -5000)).toBe(true);
    expect(isValidEntryAmount('return', 5000)).toBe(false);
  });

  it('lets an adjustment go either way, but never nowhere', () => {
    expect(isValidEntryAmount('adjustment', 500)).toBe(true);
    expect(isValidEntryAmount('adjustment', -500)).toBe(true);
    expect(isValidEntryAmount('adjustment', 0)).toBe(false);
  });

  it('rejects a fraction of a cent', () => {
    expect(isValidEntryAmount('sale', 150.5)).toBe(false);
  });
});

describe('due dates', () => {
  it('is the sale date plus the agreed term', () => {
    expect(dueDateFor(new Date('2026-11-26T14:30:00.000Z'), 30)).toEqual(day('2026-12-26'));
  });

  it('crosses a month and a year end', () => {
    expect(dueDateFor(day('2026-12-20'), 30)).toEqual(day('2027-01-19'));
  });

  it('with a term of zero days is due the same day', () => {
    expect(dueDateFor(day('2026-11-26'), 0)).toEqual(day('2026-11-26'));
  });

  it('refuses a term that is not whole days', () => {
    expect(() => dueDateFor(day('2026-11-26'), 1.5)).toThrow(/whole number of days/);
  });
});

describe('counting days', () => {
  it('ignores the time of day, so one day late is one day late', () => {
    expect(
      daysBetween(new Date('2026-11-26T23:59:00.000Z'), new Date('2026-11-27T00:01:00.000Z')),
    ).toBe(1);
    expect(
      daysBetween(new Date('2026-11-26T01:00:00.000Z'), new Date('2026-11-26T22:00:00.000Z')),
    ).toBe(0);
  });

  it('is negative before the date arrives', () => {
    expect(daysBetween(day('2026-12-26'), day('2026-11-26'))).toBe(-30);
  });
});

describe('ageing buckets', () => {
  it('puts each number of days overdue in the agreed bucket', () => {
    expect(bucketFor(-1)).toBe('not_due');
    expect(bucketFor(0)).toBe('not_due');
    expect(bucketFor(1)).toBe('days_1_30');
    expect(bucketFor(30)).toBe('days_1_30');
    expect(bucketFor(31)).toBe('days_31_60');
    expect(bucketFor(60)).toBe('days_31_60');
    expect(bucketFor(61)).toBe('days_61_90');
    expect(bucketFor(90)).toBe('days_61_90');
    expect(bucketFor(91)).toBe('days_90_plus');
  });
});

describe('ageing what a shop owes', () => {
  const asOf = day('2026-11-26');

  it('is nothing for a shop that owes nothing', () => {
    const aged = ageOutstanding({ sales: [], creditsCents: 0, asOf });
    expect(aged.outstandingCents).toBe(0);
    expect(aged.oldestOverdueDays).toBeNull();
    expect(aged.buckets.days_1_30).toBe(0);
  });

  it('leaves a debt that is not due yet out of the overdue buckets', () => {
    const aged = ageOutstanding({
      sales: [{ amountCents: 50000, dueDate: day('2026-12-10') }],
      creditsCents: 0,
      asOf,
    });
    expect(aged.buckets.not_due).toBe(50000);
    expect(aged.oldestOverdueDays).toBeNull();
  });

  it('splits debts across buckets by how late each one is', () => {
    const aged = ageOutstanding({
      sales: [
        { amountCents: 10000, dueDate: day('2026-11-20') }, // 6 days
        { amountCents: 20000, dueDate: day('2026-10-20') }, // 37 days
        { amountCents: 30000, dueDate: day('2026-09-10') }, // 77 days
        { amountCents: 40000, dueDate: day('2026-06-01') }, // 178 days
        { amountCents: 50000, dueDate: day('2026-12-25') }, // not due
      ],
      creditsCents: 0,
      asOf,
    });

    expect(aged.buckets).toEqual({
      not_due: 50000,
      days_1_30: 10000,
      days_31_60: 20000,
      days_61_90: 30000,
      days_90_plus: 40000,
    });
    expect(aged.outstandingCents).toBe(150000);
    expect(aged.oldestOverdueDays).toBe(178);
  });

  it('applies payments to the oldest debt first', () => {
    // A shop that pays something every visit should not show an ancient debt.
    const aged = ageOutstanding({
      sales: [
        { amountCents: 30000, dueDate: day('2026-06-01') }, // very old
        { amountCents: 20000, dueDate: day('2026-11-20') }, // recent
      ],
      creditsCents: 30000,
      asOf,
    });

    expect(aged.outstandingCents).toBe(20000);
    expect(aged.buckets.days_90_plus).toBe(0); // the old one is settled
    expect(aged.buckets.days_1_30).toBe(20000);
    expect(aged.oldestOverdueDays).toBe(6);
  });

  it('splits a debt that a payment only partly covers', () => {
    const aged = ageOutstanding({
      sales: [
        { amountCents: 30000, dueDate: day('2026-06-01') },
        { amountCents: 20000, dueDate: day('2026-11-20') },
      ],
      creditsCents: 10000,
      asOf,
    });

    expect(aged.buckets.days_90_plus).toBe(20000); // 300 − 100 still owed on the old one
    expect(aged.buckets.days_1_30).toBe(20000);
    expect(aged.outstandingCents).toBe(40000);
  });

  it('reports a shop that has overpaid as being in credit, and does not age it', () => {
    const aged = ageOutstanding({
      sales: [{ amountCents: 20000, dueDate: day('2026-06-01') }],
      creditsCents: 35000,
      asOf,
    });

    expect(aged.outstandingCents).toBe(-15000);
    expect(aged.buckets.days_90_plus).toBe(0);
    expect(aged.oldestOverdueDays).toBeNull();
  });

  it('does not care what order the sales arrive in', () => {
    const sales = [
      { amountCents: 30000, dueDate: day('2026-06-01') },
      { amountCents: 20000, dueDate: day('2026-11-20') },
    ];
    const forwards = ageOutstanding({ sales, creditsCents: 25000, asOf });
    const backwards = ageOutstanding({ sales: [...sales].reverse(), creditsCents: 25000, asOf });
    expect(forwards).toEqual(backwards);
  });

  it('counts a debt due today as not yet overdue', () => {
    const aged = ageOutstanding({
      sales: [{ amountCents: 10000, dueDate: asOf }],
      creditsCents: 0,
      asOf,
    });
    expect(aged.buckets.not_due).toBe(10000);
  });
});
