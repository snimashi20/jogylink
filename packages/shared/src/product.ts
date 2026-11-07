import { z } from 'zod';
import { MoneySchema } from './money';

/** Sold by the piece (packs) or by weight. Returns and partial returns depend on this. */
export const UnitTypeSchema = z.enum(['piece', 'weight']);
export type UnitType = z.infer<typeof UnitTypeSchema>;

/** Markup multiplier such as 1.10. Never below 1.0: the website is never cheaper than a shop. */
export const MarkupSchema = z.number().min(1).max(10);

/**
 * Full product, as the OWNER sees it (admin screen A2 shows both prices side by side).
 * `retailPrice` is DERIVED by the server (wholesale x markup). It is never stored or sent in.
 */
export const ProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  unitType: UnitTypeSchema,
  wholesalePrice: MoneySchema,
  /** null = use the system-wide markup from settings */
  retailMarkupOverride: MarkupSchema.nullable(),
  retailPrice: MoneySchema,
  active: z.boolean(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unitType: UnitTypeSchema,
  wholesalePrice: MoneySchema,
  retailMarkupOverride: MarkupSchema.nullable().optional(),
});
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

/** What the POS gets: wholesale price only. The POS never sees or charges the retail price. */
export const PosProductSchema = ProductSchema.pick({
  id: true,
  sku: true,
  name: true,
  unitType: true,
  wholesalePrice: true,
});
export type PosProduct = z.infer<typeof PosProductSchema>;

/** What the public website gets: retail price only. Wholesale is never published. */
export const WebProductSchema = ProductSchema.pick({
  id: true,
  sku: true,
  name: true,
  unitType: true,
  retailPrice: true,
});
export type WebProduct = z.infer<typeof WebProductSchema>;
