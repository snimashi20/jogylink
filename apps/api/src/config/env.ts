import { z } from 'zod';

/** Injection token for the validated environment (see ConfigModule). */
export const APP_ENV = 'APP_ENV';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (see .env.example for how to make one)')
    .refine((v) => !v.toLowerCase().startsWith('change-me'), {
      message: 'JWT_SECRET is still the placeholder value',
    }),
  /** How long a login lasts. Default 12 hours = one working day on the van. */
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(12 * 60 * 60),
  /** bcrypt cost for new passwords. Tests lower it for speed. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  /** Comma-separated list of allowed web origins. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** After this many wrong passwords in a row (per IP + username) login is locked for a while. */
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .default(15 * 60),
});

export type Env = z.infer<typeof EnvSchema>;

/** Reads and validates the environment once, at start-up. Fails fast with a readable message. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
