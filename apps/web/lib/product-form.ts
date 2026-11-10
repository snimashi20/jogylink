import { checkMarkup } from './markup';
import { toCents, fromCents, type CreateProduct, type UnitType } from '@jogylink/shared';

export interface ProductFormValues {
  sku: string;
  name: string;
  unitType: UnitType;
  /** What the person typed, in rupees. */
  wholesale: string;
  /** Blank means "use the shop-wide markup". */
  markup: string;
}

export type ProductFormErrors = Partial<Record<'sku' | 'name' | 'wholesale' | 'markup', string>>;

/** Rupees as typed ("150", "1,250.5") to a number, or null when it is not a clean price. */
export function parseRupees(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/^rs\.?\s*/i, '')
    .replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return fromCents(toCents(Number(cleaned)));
}

/** Every message says what to do, not just what is wrong. */
export function validateProductForm(
  v: ProductFormValues,
): { ok: true; value: CreateProduct } | { ok: false; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};

  if (v.sku.trim() === '') errors.sku = 'Enter a product code, for example KD-250.';
  if (v.name.trim() === '') errors.name = 'Enter the product name.';

  const wholesale = parseRupees(v.wholesale);
  if (v.wholesale.trim() === '') errors.wholesale = 'Enter the wholesale price in rupees.';
  else if (wholesale === null) {
    errors.wholesale = 'Enter the price as a number, for example 150 or 150.50.';
  } else if (wholesale <= 0) errors.wholesale = 'Enter a price above Rs 0.';

  let markup: number | null = null;
  if (v.markup.trim() !== '') {
    const checked = checkMarkup(v.markup);
    if (checked.ok) markup = checked.value;
    else errors.markup = checked.error;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sku: v.sku.trim().toUpperCase(),
      name: v.name.trim(),
      unitType: v.unitType,
      wholesalePrice: wholesale!,
      retailMarkupOverride: markup,
    },
  };
}
