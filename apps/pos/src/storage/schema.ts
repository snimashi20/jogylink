import type { SqliteDriver } from './types';

/**
 * The local database on the device, as a list of migrations.
 *
 * Append-only: once a version has shipped on a device it is never edited, because the device
 * may already have run it. `PRAGMA user_version` records how many have been applied.
 *
 * SQLite has no date type, so times are INTEGER epoch milliseconds, and money is INTEGER cents —
 * the same rule as the server, see @jogylink/shared. Booleans are 0 or 1.
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

  /*
   * 2 — what the van produces, and the read-only cache it reads.
   *
   * The write tables (`sale`, `sale_line`, `payment`, `return`) are the device's own record of
   * what happened: they are what a receipt is reprinted from and what a balance is derived from,
   * and they share the uuid of their outbox event.
   *
   * There is deliberately no `paid` column on a sale. Cash handed over at the shop is a payment
   * event like any other, so a balance is always sales minus payments minus return credits, with
   * one way to count each. See docs/sync.md.
   *
   * `shop` and `product` are a cache of server rows, refreshed on each successful sync and never
   * edited on the device. `server_balance_cents` is the balance as the server last reported it;
   * it is refreshed in the same transaction that marks events synced, so the unsynced events in
   * the outbox are exactly the difference between it and the real balance.
   */
  `CREATE TABLE IF NOT EXISTS sale (
     uuid        TEXT    NOT NULL PRIMARY KEY,
     shop_id     TEXT    NOT NULL,
     user_id     TEXT    NOT NULL,
     sold_at     INTEGER NOT NULL,
     total_cents INTEGER NOT NULL,
     note        TEXT,
     created_at  INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS sale_shop ON sale (shop_id);

   CREATE TABLE IF NOT EXISTS sale_line (
     sale_uuid        TEXT    NOT NULL REFERENCES sale (uuid) ON DELETE CASCADE,
     line_no          INTEGER NOT NULL,
     product_id       TEXT    NOT NULL,
     batch_id         TEXT,
     unit_type        TEXT    NOT NULL,
     quantity         INTEGER NOT NULL,
     unit_price_cents INTEGER NOT NULL,
     line_total_cents INTEGER NOT NULL,
     PRIMARY KEY (sale_uuid, line_no)
   );

   CREATE TABLE IF NOT EXISTS payment (
     uuid         TEXT    NOT NULL PRIMARY KEY,
     shop_id      TEXT    NOT NULL,
     amount_cents INTEGER NOT NULL,
     method       TEXT    NOT NULL,
     received_at  INTEGER NOT NULL,
     created_at   INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS payment_shop ON payment (shop_id);

   CREATE TABLE IF NOT EXISTS "return" (
     uuid              TEXT    NOT NULL PRIMARY KEY,
     shop_id           TEXT    NOT NULL,
     product_id        TEXT    NOT NULL,
     batch_id          TEXT,
     return_unit       TEXT    NOT NULL,
     quantity_returned INTEGER NOT NULL,
     is_partial        INTEGER NOT NULL,
     credit_cents      INTEGER NOT NULL,
     photo_path        TEXT,
     returned_at       INTEGER NOT NULL,
     created_at        INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS return_shop ON "return" (shop_id);

   CREATE TABLE IF NOT EXISTS shop (
     id                   TEXT    NOT NULL PRIMARY KEY,
     code                 TEXT    NOT NULL,
     name                 TEXT    NOT NULL,
     phone                TEXT,
     address              TEXT,
     locality             TEXT,
     credit_limit_cents   INTEGER NOT NULL,
     route_id             TEXT,
     visit_order          INTEGER,
     is_active            INTEGER NOT NULL,
     server_balance_cents INTEGER NOT NULL,
     refreshed_at         INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS shop_route ON shop (route_id, visit_order);

   CREATE TABLE IF NOT EXISTS product (
     id                    TEXT    NOT NULL PRIMARY KEY,
     sku                   TEXT    NOT NULL,
     name                  TEXT    NOT NULL,
     unit_type             TEXT    NOT NULL,
     wholesale_price_cents INTEGER NOT NULL,
     active                INTEGER NOT NULL,
     refreshed_at          INTEGER NOT NULL
   );`,
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
