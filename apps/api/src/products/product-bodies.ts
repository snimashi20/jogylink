import { CreateProductSchema, UpdateProductSchema } from '@jogylink/shared';

/** The shared schema allows any number of decimals; the database column keeps exactly 4. */
function hasAtMostFourDecimals(n: number | null | undefined): boolean {
  if (n == null) return true;
  return Math.abs(n * 10_000 - Math.round(n * 10_000)) < 1e-6;
}

const markupMessage = { path: ['retailMarkupOverride'], message: 'At most 4 decimal places' };

export const CreateProductBody = CreateProductSchema.refine(
  (v) => hasAtMostFourDecimals(v.retailMarkupOverride),
  markupMessage,
);

export const UpdateProductBody = UpdateProductSchema.refine(
  (v) => hasAtMostFourDecimals(v.retailMarkupOverride),
  markupMessage,
);
