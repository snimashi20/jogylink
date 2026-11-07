import { z } from 'zod';
import { ShopResponseSchema } from './shop';

const RouteCodeSchema = z.string().trim().min(1).max(32);
const RouteNameSchema = z.string().trim().min(1).max(160);

export const RouteResponseSchema = z.object({
  id: z.string().uuid(),
  code: RouteCodeSchema,
  name: RouteNameSchema,
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RouteResponse = z.infer<typeof RouteResponseSchema>;

export const RouteDetailResponseSchema = RouteResponseSchema.extend({
  shops: z.array(ShopResponseSchema),
});
export type RouteDetailResponse = z.infer<typeof RouteDetailResponseSchema>;

export const RouteCreateSchema = z.object({
  code: RouteCodeSchema,
  name: RouteNameSchema,
  description: z.string().trim().max(500).nullable().optional(),
});
export type RouteCreate = z.infer<typeof RouteCreateSchema>;

export const RouteUpdateSchema = z
  .object({
    code: RouteCodeSchema.optional(),
    name: RouteNameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type RouteUpdate = z.infer<typeof RouteUpdateSchema>;

const ActiveQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const RouteListQuerySchema = z.object({
  query: z.string().trim().max(160).optional(),
  active: ActiveQuerySchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type RouteListQuery = z.infer<typeof RouteListQuerySchema>;

export const RouteListResponseSchema = z.object({
  items: z.array(RouteResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type RouteListResponse = z.infer<typeof RouteListResponseSchema>;

/** Full replacement: array order becomes visit order; an empty array unassigns all shops. */
export const ReplaceRouteShopsSchema = z
  .object({
    shopIds: z.array(z.string().uuid()).max(500),
  })
  .refine((value) => new Set(value.shopIds).size === value.shopIds.length, {
    message: 'A shop may appear only once',
    path: ['shopIds'],
  });
export type ReplaceRouteShops = z.infer<typeof ReplaceRouteShopsSchema>;

export const RouteShopAssignmentResponseSchema = RouteDetailResponseSchema;
export type RouteShopAssignmentResponse = z.infer<typeof RouteShopAssignmentResponseSchema>;
