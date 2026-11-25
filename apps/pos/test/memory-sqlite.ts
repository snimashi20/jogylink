import { DatabaseSync } from 'node:sqlite';
import type { SqliteDriver, SqliteRunResult, SqlValue } from '../src/storage/types';

/**
 * A real SQLite database in memory, behind the same driver port the device uses.
 *
 * The point is that these tests exercise the actual SQL — the primary key, the ON CONFLICT and
 * the pending index — not a hand-written imitation of it. `node:sqlite` ships with Node, so
 * nothing has to be installed and no phone is involved.
 */
export function memorySqlite(): SqliteDriver {
  const db = new DatabaseSync(':memory:');
  let inTransaction = false;

  return {
    async execute(sql: string): Promise<void> {
      db.exec(sql);
    },

    async run(sql: string, params: readonly SqlValue[] = []): Promise<SqliteRunResult> {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },

    async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },

    async transaction<T>(work: () => Promise<T>): Promise<T> {
      // SQLite has no nested transactions; an inner call simply joins the outer one.
      if (inTransaction) return work();

      db.exec('BEGIN');
      inTransaction = true;
      try {
        const out = await work();
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        inTransaction = false;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
