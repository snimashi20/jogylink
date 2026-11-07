import { z } from 'zod';
import { MoneySchema } from './money';

const ShopCodeSchema = z.string().trim().min(1).max(32);
const ShopNameSchema = z.string().trim().min(1).max(160);
const OptionalShopTextSchema = z.string().trim().max(500).nullable().optional();

export const ShopResponseSchema = z.object({
  id: z.string().uuid(),
  code: ShopCodeSchema,
  name: ShopNameSchema,
  phone: z.string().nullable(),
  address: z.string().nullable(),
  locality: z.string().nullable(),
  creditLimit: MoneySchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ShopResponse = z.infer<typeof ShopResponseSchema>;

export const ShopCreateSchema = z.object({
  code: ShopCodeSchema,
  name: ShopNameSchema,
  phone: OptionalShopTextSchema,
  address: OptionalShopTextSchema,
  locality: z.string().trim().max(160).nullable().optional(),
  creditLimit: MoneySchema.optional().default(0),
});
export type ShopCreate = z.infer<typeof ShopCreateSchema>;

export const ShopUpdateSchema = z
  .object({
    code: ShopCodeSchema.optional(),
    name: ShopNameSchema.optional(),
    phone: OptionalShopTextSchema,
    address: OptionalShopTextSchema,
    locality: z.string().trim().max(160).nullable().optional(),
    creditLimit: MoneySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type ShopUpdate = z.infer<typeof ShopUpdateSchema>;

const ActiveQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const ShopListQuerySchema = z.object({
  query: z.string().trim().max(160).optional(),
  active: ActiveQuerySchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ShopListQuery = z.infer<typeof ShopListQuerySchema>;

export const ShopListResponseSchema = z.object({
  items: z.array(ShopResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ShopListResponse = z.infer<typeof ShopListResponseSchema>;
