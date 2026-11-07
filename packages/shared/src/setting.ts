import { z } from 'zod';
import { DEFAULT_RETAIL_MARKUP } from './pricing';

/**
 * System settings: one row per key, read by every module through the settings service.
 * Other modules read these; only M1's settings service writes them.
 */
export const SETTING_DEFINITIONS = {
  /** Retail price = wholesale x this. Changing it updates every website price at once. */
  retail_markup: { default: Number(DEFAULT_RETAIL_MARKUP), schema: z.number().min(1).max(10) },

  /**
   * Expiry stages, by days remaining until expiry (M3 uses these):
   *   GREEN  : days >= expiry_green_min_days   (46+)
   *   YELLOW : days >= expiry_yellow_min_days  (45-22)
   *   ORANGE : days >= expiry_orange_min_days  (21-8)
   *   RED    : anything lower, or already expired. Red is blocked from all sale.
   * NOTE: the design doc says Orange 21-8 and Red "under 7", which leaves day 7 undefined.
   * Here RED means 7 days or fewer. M3 to confirm.
   */
  expiry_green_min_days: { default: 46, schema: z.number().int().min(1) },
  expiry_yellow_min_days: { default: 22, schema: z.number().int().min(1) },
  expiry_orange_min_days: { default: 8, schema: z.number().int().min(1) },

  /** Supplier-claim triggers (M7). PLACEHOLDER defaults: the owner/M7 should confirm. */
  claim_value_trigger: { default: 5000, schema: z.number().min(0) },
  claim_age_trigger_days: { default: 14, schema: z.number().int().min(1) },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SettingKeySchema = z.enum(
  Object.keys(SETTING_DEFINITIONS) as [SettingKey, ...SettingKey[]],
);

export const SettingSchema = z.object({
  key: SettingKeySchema,
  value: z.unknown(),
  updatedAt: z.coerce.date(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const UpdateSettingSchema = z.object({ value: z.unknown() });
export type UpdateSetting = z.infer<typeof UpdateSettingSchema>;

/** Validates a value against the rules of its key. Throws a ZodError when it is invalid. */
export function parseSettingValue(key: SettingKey, value: unknown): unknown {
  return SETTING_DEFINITIONS[key].schema.parse(value);
}
