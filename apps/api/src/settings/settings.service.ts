import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { settings } from '@jogylink/db';
import {
  parseSettingValue,
  SETTING_DEFINITIONS,
  type Setting,
  type SettingKey,
} from '@jogylink/shared';
import { isZodError } from '../common/db-errors';
import { DB, type Db } from '../db/db.module';

export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_DEFINITIONS)[K]['schema']>;

const KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

/**
 * M1 — the settings service. Every other module reads its numbers from here:
 *
 *   constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}
 *   const markup = await this.settings.get('retail_markup'); // typed: number
 *
 * Reads always hit the database, so a change made by the owner applies to the very next request.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Makes sure every key has a row. Never overwrites a value the owner has changed. */
  async onModuleInit(): Promise<void> {
    try {
      await this.db
        .insert(settings)
        .values(KEYS.map((key) => ({ key, value: SETTING_DEFINITIONS[key].default })))
        .onConflictDoNothing({ target: settings.key });
    } catch (err) {
      // Not fatal: get() falls back to the defaults. Usually means migrations have not run yet.
      this.logger.warn(`Could not create default settings: ${(err as Error).message}`);
    }
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (!row) return SETTING_DEFINITIONS[key].default as SettingValue<K>;
    // A corrupt stored value should fail loudly, not silently fall back to a default.
    return parseSettingValue(key, row.value) as SettingValue<K>;
  }

  async getAll(): Promise<Setting[]> {
    const rows = await this.db.select().from(settings);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return KEYS.map((key) => {
      const row = byKey.get(key);
      return row
        ? { key, value: row.value, updatedAt: row.updatedAt }
        : { key, value: SETTING_DEFINITIONS[key].default, updatedAt: new Date(0) };
    });
  }

  async update(key: SettingKey, rawValue: unknown, userId: string): Promise<Setting> {
    let value: unknown;
    try {
      value = parseSettingValue(key, rawValue);
    } catch (err) {
      if (!isZodError(err)) throw err;
      throw new BadRequestException({
        message: 'Validation failed',
        issues: err.issues.map((i) => ({ path: 'value', message: i.message })),
      });
    }

    if (key.startsWith('expiry_')) await this.assertExpiryOrder(key, value as number);

    const [row] = await this.db
      .insert(settings)
      .values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date(), updatedBy: userId },
      })
      .returning();
    return { key, value: row!.value, updatedAt: row!.updatedAt };
  }

  /** The stages must stay in order, or an item could be Green and Yellow at once. */
  private async assertExpiryOrder(changed: SettingKey, newValue: number): Promise<void> {
    const days = {
      green: await this.get('expiry_green_min_days'),
      yellow: await this.get('expiry_yellow_min_days'),
      orange: await this.get('expiry_orange_min_days'),
    };
    if (changed === 'expiry_green_min_days') days.green = newValue;
    if (changed === 'expiry_yellow_min_days') days.yellow = newValue;
    if (changed === 'expiry_orange_min_days') days.orange = newValue;

    if (!(days.green > days.yellow && days.yellow > days.orange)) {
      throw new UnprocessableEntityException(
        `Expiry stages must go green > yellow > orange (now ${days.green} > ${days.yellow} > ${days.orange})`,
      );
    }
  }
}
