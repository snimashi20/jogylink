import * as SQLite from 'expo-sqlite';
import { migrateLocalDatabase } from './schema';
import type { SqliteDriver, SqliteRunResult, SqlValue } from './types';

/** The database file on the handheld. One file, one worker, one van. */
export const DEVICE_DATABASE_NAME = 'jogylink.db';

/** Puts the expo-sqlite connection behind the driver port the storage layer is written against. */
export function wrapExpoDatabase(db: SQLite.SQLiteDatabase): SqliteDriver {
  return {
    async execute(sql: string): Promise<void> {
      await db.execAsync(sql);
    },

    async run(sql: string, params: readonly SqlValue[] = []): Promise<SqliteRunResult> {
      const result = await db.runAsync(sql, [...params]);
      return { changes: result.changes };
    },

    async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      return db.getAllAsync<T>(sql, [...params]);
    },

    async transaction<T>(work: () => Promise<T>): Promise<T> {
      let out: T;
      await db.withTransactionAsync(async () => {
        out = await work();
      });
      // Assigned by the callback above, which has already run and did not throw.
      return out!;
    },

    async close(): Promise<void> {
      await db.closeAsync();
    },
  };
}

/**
 * Opens the device database and brings its schema up to date. Call once when the app starts,
 * then hand the driver to the repositories.
 *
 * WAL is on so a long write (a sale with many lines) never blocks a read on the UI thread.
 */
export async function openDeviceDatabase(
  name: string = DEVICE_DATABASE_NAME,
): Promise<SqliteDriver> {
  const db = wrapExpoDatabase(await SQLite.openDatabaseAsync(name));
  await db.execute('PRAGMA journal_mode = WAL;');
  await migrateLocalDatabase(db);
  return db;
}
