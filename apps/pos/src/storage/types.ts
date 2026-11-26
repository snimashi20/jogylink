/**
 * The device-side storage contract for the POS (M6).
 *
 * Everything below the UI goes through these types. The rest of the app never imports
 * `expo-sqlite` directly, for two reasons:
 *  - the sync rules can then be tested in plain Node, with no phone and no native modules;
 *  - the one place that talks to SQLite is small enough to read in full.
 */

/** The only value kinds we bind to a statement. Money is integer cents, dates are epoch ms. */
export type SqlValue = string | number | null;

export interface SqliteRunResult {
  /** How many rows the statement actually changed. */
  changes: number;
}

/**
 * The narrow slice of SQLite the storage layer needs. `expo-sqlite` on the device and
 * `node:sqlite` in the tests both sit behind this.
 */
export interface SqliteDriver {
  /** Run one or more statements with no parameters and no result (DDL, PRAGMA). */
  execute(sql: string): Promise<void>;
  /** Run one statement with bound parameters. */
  run(sql: string, params?: readonly SqlValue[]): Promise<SqliteRunResult>;
  /** Run one query with bound parameters and read every row. */
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Run the given work inside a transaction, rolling back if it throws. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  /** Close the connection. */
  close(): Promise<void>;
}

/**
 * What the van can produce while offline. Each one is a fact that already happened, so the
 * server only ever has to insert it exactly once — see docs/sync.md.
 */
export const OUTBOX_EVENT_TYPES = ['sale', 'return', 'payment'] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export function isOutboxEventType(value: string): value is OutboxEventType {
  return (OUTBOX_EVENT_TYPES as readonly string[]).includes(value);
}

/** An event handed to the outbox. The caller generates the uuid before saving anything. */
export interface OutboxEvent {
  uuid: string;
  type: OutboxEventType;
  /** Anything JSON.stringify can take. The shape is the sync endpoint's contract, not ours. */
  payload: unknown;
}

/** An event read back out of the outbox, still waiting for the server to confirm it. */
export interface PendingEvent extends OutboxEvent {
  createdAt: Date;
}

/** What the sync-status screen, the offline banner and the sign-out guard all read. */
export interface SyncStatus {
  /** Events waiting to be sent. Still counting down to zero on a good day. */
  pending: number;
  /**
   * Events the server has refused. They are still on the device, and no amount of waiting will
   * clear them: a person has to look. Never included in `pending`, so a bad event cannot make
   * the queue look stuck forever, and never dropped either.
   */
  needsAttention: number;
  /** When the server last confirmed an event, or null if it never has. */
  lastSyncedAt: Date | null;
}

/** An event the server refused, as the sync status screen lists it. */
export interface RejectedEvent {
  uuid: string;
  type: OutboxEventType;
  /** What the server said. Shown to the worker, so it is kept verbatim. */
  reason: string;
  attempts: number;
  createdAt: Date;
  rejectedAt: Date;
}
