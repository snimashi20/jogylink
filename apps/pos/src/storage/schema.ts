import type { SqliteDriver } from './types';

/**
 * The local database on the device, as a list of migrations.
 *
 * Append-only: once a version has shipped on a device it is never edited, because the device
 * may already have run it. `PRAGMA user_version` records how many have been applied.
 *
 * SQLite has no date type, so times are INTEGER epoch milliseconds, and money (when the sale
 * tables arrive) is INTEGER cents — the same rule as the server, see @jogylink/shared.
 */
export const LOCAL_MIGRATIONS: readonly string[] = [
  /*
   * 1 — the outbox.
   *
   * `uuid` is generated on the device before the sale is saved, and is the primary key here and
   * on the server, so replaying a batch inserts nothing the second time. `synced_at IS NULL`
   * means "the server has not confirmed this yet"; nothing is deleted on confirmation, so a
   * receipt can still be reprinted from the device afterwards.
   */
  `CREATE TABLE IF NOT EXISTS outbox (
     uuid       TEXT    NOT NULL PRIMARY KEY,
     event_type TEXT    NOT NULL,
     payload    TEXT    NOT NULL,
     created_at INTEGER NOT NULL,
     synced_at  INTEGER
   );
   CREATE INDEX IF NOT EXISTS outbox_pending
     ON outbox (created_at) WHERE synced_at IS NULL;`,
];

/** The version a freshly migrated device database is at. */
export const LOCAL_SCHEMA_VERSION = LOCAL_MIGRATIONS.length;

/**
 * Brings the device database up to `LOCAL_SCHEMA_VERSION`. Safe to call on every app start:
 * already-applied migrations are skipped.
 */
export async function migrateLocalDatabase(db: SqliteDriver): Promise<number> {
  await db.execute('PRAGMA foreign_keys = ON;');

  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version;');
  const applied = row?.user_version ?? 0;

  if (applied > LOCAL_SCHEMA_VERSION) {
    // An older build opened a database written by a newer one. Carrying on could mean writing
    // sales in a shape the newer build cannot read, so stop and say so plainly.
    throw new Error(
      `This device holds version ${applied} of the local database, but this app only knows ` +
        `version ${LOCAL_SCHEMA_VERSION}. Update the app before using it.`,
    );
  }

  for (let version = applied; version < LOCAL_MIGRATIONS.length; version += 1) {
    const sql = LOCAL_MIGRATIONS[version];
    if (sql === undefined) continue;
    // One transaction per step: a migration interrupted by a flat battery is either fully
    // applied or not applied at all.
    await db.transaction(async () => {
      await db.execute(sql);
      // Not a bound parameter because SQLite does not allow one here; the value is a loop
      // index over our own array, never anything from outside.
      await db.execute(`PRAGMA user_version = ${version + 1};`);
    });
  }

  return LOCAL_SCHEMA_VERSION;
}
