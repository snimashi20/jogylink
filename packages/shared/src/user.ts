import { z } from 'zod';

/** Two roles only: the owner sees everything, the worker uses the POS. */
export const RoleSchema = z.enum(['owner', 'worker']);
export type Role = z.infer<typeof RoleSchema>;

/** 72 is bcrypt's limit: anything longer would be silently cut off. */
export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  username: z.string().min(3).max(40),
  role: RoleSchema,
  active: z.boolean(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'lower-case letters, digits, . _ - only'),
  password: PasswordSchema,
  role: RoleSchema,
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: RoleSchema.optional(),
  active: z.boolean().optional(),
  password: PasswordSchema.optional(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
