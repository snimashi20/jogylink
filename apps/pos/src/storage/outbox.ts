import {
  isOutboxEventType,
  type OutboxEvent,
  type OutboxEventType,
  type PendingEvent,
  type RejectedEvent,
  type SqliteDriver,
  type SqlValue,
  type SyncStatus,
} from './types';

/** How many events one sync upload carries by default. */
export const DEFAULT_BATCH_SIZE = 100;

/** SQLite's default limit on bound parameters is 999; stay well inside it. */
const MAX_PARAMS_PER_STATEMENT = 100;

export interface OutboxOptions {
  /** The clock, injectable so the tests do not depend on wall time. */
  now?: () => number;
}

/**
 * The queue of things that happened in the van and the server has not confirmed yet.
 *
 * The rule the whole module rests on: a sale is a fact that already happened, so it is never
 * merged — only inserted exactly once. That makes every operation here safe to repeat:
 *
 *  - appending the same uuid twice keeps the first row and ignores the second;
 *  - a crash mid-upload just means the same events are sent again and ignored on arrival;
 *  - a row is marked synced only when the server has named its uuid as accepted.
 *
 * See docs/sync.md.
 */
export class Outbox {
  private readonly now: () => number;

  constructor(
    private readonly db: SqliteDriver,
    options: OutboxOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Appends an event. Returns true if it was stored, false if that uuid was already queued —
   * which is not an error: it means a retried save, and the first row stands.
   *
   * Call this inside the same db.transaction as the rows it describes (the sale and its lines),
   * so a sale can never exist locally without its outbox entry.
   */
  async append(event: OutboxEvent): Promise<boolean> {
    if (event.uuid.length === 0) throw new Error('An outbox event needs a uuid.');

    const result = await this.db.run(
      `INSERT INTO outbox (uuid, event_type, payload, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (uuid) DO NOTHING;`,
      [event.uuid, event.type, JSON.stringify(event.payload), this.now()],
    );
    return result.changes > 0;
  }

  /**
   * The next events to upload, oldest first, so the server sees them in the order the worker
   * created them. Ties on the millisecond are broken by insertion order.
   */
  async pending(limit: number = DEFAULT_BATCH_SIZE): Promise<PendingEvent[]> {
    if (limit <= 0) return [];

    const rows = await this.db.all<{
      uuid: string;
      event_type: string;
      payload: string;
      created_at: number;
    }>(
      `SELECT uuid, event_type, payload, created_at
         FROM outbox
        WHERE synced_at IS NULL AND rejected_at IS NULL
        ORDER BY created_at, rowid
        LIMIT ?;`,
      [limit],
    );

    return rows.map((row) => ({
      uuid: row.uuid,
      type: readEventType(row.uuid, row.event_type),
      payload: readPayload(row.uuid, row.payload),
      createdAt: new Date(row.created_at),
    }));
  }

  /** How many events are still waiting to be sent. Refused events are counted separately. */
  async pendingCount(): Promise<number> {
    const [row] = await this.db.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NULL AND rejected_at IS NULL;',
    );
    return row?.n ?? 0;
  }

  /**
   * Everything this device has not got onto the server, refused events included. This is the
   * number the sign-out guard cares about: signing out with any of these is losing a sale.
   */
  async unsentCount(): Promise<number> {
    const [row] = await this.db.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NULL;',
    );
    return row?.n ?? 0;
  }

  /**
   * Notes that we tried to send these and it did not work. Keeps the reason, so the sync screen
   * can say what is wrong after a restart instead of just "pending".
   */
  async recordAttempt(uuids: readonly string[], error: string | null = null): Promise<void> {
    if (uuids.length === 0) return;
    const at = this.now();

    for (const chunk of chunksOf(dedupe(uuids), MAX_PARAMS_PER_STATEMENT)) {
      const placeholders = chunk.map(() => '?').join(', ');
      await this.db.run(
        `UPDATE outbox
            SET attempts        = attempts + 1,
                last_attempt_at = ?,
                last_error      = ?
          WHERE synced_at IS NULL
            AND uuid IN (${placeholders});`,
        [at, error, ...chunk] as SqlValue[],
      );
    }
  }

  /**
   * Records that the server refuses these events outright, with its reason.
   *
   * They leave the pending queue so they cannot block the sales behind them, and they stay on
   * the device for a person to look at. Nothing is deleted. An event the server has already
   * accepted is never marked refused, whatever a later reply says.
   */
  async recordRejections(rejections: readonly { uuid: string; reason: string }[]): Promise<number> {
    let marked = 0;
    const at = this.now();

    for (const rejection of rejections) {
      const result = await this.db.run(
        `UPDATE outbox
            SET rejected_at      = ?,
                rejection_reason = ?
          WHERE uuid = ? AND synced_at IS NULL AND rejected_at IS NULL;`,
        [at, rejection.reason, rejection.uuid],
      );
      marked += result.changes;
    }

    return marked;
  }

  /** The refused events, newest first, for the sync status screen. */
  async rejected(limit = 50): Promise<RejectedEvent[]> {
    if (limit <= 0) return [];

    const rows = await this.db.all<{
      uuid: string;
      event_type: string;
      rejection_reason: string | null;
      attempts: number;
      created_at: number;
      rejected_at: number;
    }>(
      `SELECT uuid, event_type, rejection_reason, attempts, created_at, rejected_at
         FROM outbox
        WHERE rejected_at IS NOT NULL AND synced_at IS NULL
        ORDER BY rejected_at DESC, rowid DESC
        LIMIT ?;`,
      [limit],
    );

    return rows.map((row) => ({
      uuid: row.uuid,
      type: readEventType(row.uuid, row.event_type),
      reason: row.rejection_reason ?? 'The server did not say why.',
      attempts: row.attempts,
      createdAt: new Date(row.created_at),
      rejectedAt: new Date(row.rejected_at),
    }));
  }

  /**
   * Puts refused events back in the queue — after the worker fixed something, or the owner
   * fixed the server. Only ever on an explicit action, never automatically, because an event
   * that was refused once will usually be refused again.
   */
  async clearRejections(uuids?: readonly string[]): Promise<number> {
    const clear = `SET rejected_at = NULL, rejection_reason = NULL, last_error = NULL`;

    if (uuids === undefined) {
      const result = await this.db.run(
        `UPDATE outbox ${clear} WHERE rejected_at IS NOT NULL AND synced_at IS NULL;`,
      );
      return result.changes;
    }
    if (uuids.length === 0) return 0;

    let cleared = 0;
    for (const chunk of chunksOf(dedupe(uuids), MAX_PARAMS_PER_STATEMENT)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await this.db.run(
        `UPDATE outbox ${clear}
          WHERE rejected_at IS NOT NULL AND synced_at IS NULL
            AND uuid IN (${placeholders});`,
        [...chunk],
      );
      cleared += result.changes;
    }
    return cleared;
  }

  /**
   * Records that the server has accepted these uuids.
   *
   * Only ever called with uuids the server named in its reply — never optimistically, because a
   * row marked synced is a row that will not be sent again. Unknown uuids and ones already
   * marked are ignored, so replaying a reply is harmless. Returns how many rows this call moved
   * from pending to synced.
   */
  async markSynced(uuids: readonly string[]): Promise<number> {
    if (uuids.length === 0) return 0;

    const at = this.now();
    let marked = 0;

    for (const chunk of chunksOf(dedupe(uuids), MAX_PARAMS_PER_STATEMENT)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await this.db.run(
        `UPDATE outbox
            SET synced_at = ?
          WHERE synced_at IS NULL
            AND uuid IN (${placeholders});`,
        [at, ...chunk] as SqlValue[],
      );
      marked += result.changes;
    }

    return marked;
  }

  /**
   * What the sync status screen shows.
   *
   * lastSyncedAt is the newest confirmation on the device, so a sync that had nothing to send
   * does not move it — the sync engine will record its own last-contacted time when it lands.
   */
  async status(): Promise<SyncStatus> {
    const [row] = await this.db.all<{
      pending: number;
      needs_attention: number;
      last: number | null;
    }>(
      `SELECT COUNT(CASE WHEN synced_at IS NULL AND rejected_at IS NULL THEN 1 END) AS pending,
              COUNT(CASE WHEN synced_at IS NULL AND rejected_at IS NOT NULL THEN 1 END)
                AS needs_attention,
              MAX(synced_at) AS last
         FROM outbox;`,
    );
    return {
      pending: row?.pending ?? 0,
      needsAttention: row?.needs_attention ?? 0,
      lastSyncedAt: row?.last == null ? null : new Date(row.last),
    };
  }

  /**
   * Clears out confirmed events older than the given time, to keep the device database small.
   *
   * Pending events are never touched, whatever their age: an event the server has not confirmed
   * is a sale that exists nowhere else.
   */
  async pruneSynced(before: Date): Promise<number> {
    const result = await this.db.run(
      'DELETE FROM outbox WHERE synced_at IS NOT NULL AND synced_at < ?;',
      [before.getTime()],
    );
    return result.changes;
  }
}

/**
 * A payload is always written by JSON.stringify, so unreadable text means the database file
 * itself is damaged. Say which row, loudly: quietly skipping it would drop a real sale.
 */
function readPayload(uuid: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Outbox event ${uuid} has an unreadable payload; the local database is damaged.`,
    );
  }
}

function readEventType(uuid: string, raw: string): OutboxEventType {
  if (!isOutboxEventType(raw)) {
    throw new Error(`Outbox event ${uuid} has an unknown type "${raw}".`);
  }
  return raw;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function chunksOf<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}
