import { z } from 'zod';

/**
 * Money is always handled as INTEGER CENTS inside code (Rs 150.00 = 15000).
 * Floating-point numbers are never used for money arithmetic.
 * On the wire (API) money is a plain number with at most 2 decimal places.
 */
export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** A money amount on the wire: non-negative, at most 2 decimal places. */
export const MoneySchema = z
  .number()
  .nonnegative()
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Money can have at most 2 decimal places',
  });
