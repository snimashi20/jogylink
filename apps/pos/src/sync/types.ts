import type { CachedProduct, CachedShop, PendingEvent } from '../storage';

/**
 * The sync engine's contracts (M6).
 *
 * The engine itself knows nothing about HTTP or about the phone's radio: it is given a `SyncApi`
 * and a `ConnectivityMonitor`. That is what lets the retry and acknowledgement rules — the part
 * where losing a sale is possible — be tested without a network or a device.
 */

/** One upload: the batch we sent, and what the server said about it. */
export interface UploadResponse {
  /**
   * The uuids the server has stored. Only these stop being sent. The server returns them whether
   * it inserted the row or found it already there, so a replayed batch is acknowledged the same
   * way the first one was.
   */
  accepted: readonly string[];
  /**
   * Events the server will never accept, and why. These are kept on the device and shown to a
   * person; they are never deleted and never retried on their own.
   */
  rejected?: readonly { uuid: string; reason: string }[];
  /** Fresh cached rows to replace what the device holds. */
  shops?: readonly CachedShop[];
  products?: readonly CachedProduct[];
}

/**
 * The upload itself. Implementations throw for anything that might work later — no signal, a
 * timeout, a 500, a reply that does not parse — and the engine retries those. Returning a
 * response means the server genuinely answered about these events.
 */
export interface SyncApi {
  upload(events: readonly PendingEvent[]): Promise<UploadResponse>;
}

/**
 * Whether the device thinks it can reach the outside world.
 *
 * `connected` is only a hint. A phone can be attached to a tower with no working data path, so
 * the engine treats a failed upload as the stronger signal and backs off regardless of what this
 * says.
 */
export interface ConnectivityMonitor {
  isConnected(): boolean;
  /** Returns an unsubscribe function. */
  subscribe(listener: (connected: boolean) => void): () => void;
}

export type SyncPhase =
  /** Nothing to do, or waiting for the next trigger. */
  | 'idle'
  /** Uploading right now. */
  | 'syncing'
  /** Events are waiting but the device has no connection. */
  | 'offline'
  /** An upload failed; waiting before trying again. */
  | 'retrying';

/** Everything the sync status screen, the offline banner and a toast need. */
export interface SyncState {
  phase: SyncPhase;
  connected: boolean;
  /** Events waiting to be sent. */
  pending: number;
  /** Events the server refused, which a person has to deal with. */
  needsAttention: number;
  lastSyncedAt: Date | null;
  lastAttemptAt: Date | null;
  /** Why the last attempt failed, in words meant for the worker. Cleared by a success. */
  lastError: string | null;
  /** How many events went up in the last run. */
  lastUploaded: number;
  /** When the engine will try again by itself, if it is waiting. */
  nextRetryAt: Date | null;
}

/** What one `syncNow()` did. */
export interface SyncRunResult {
  uploaded: number;
  rejected: number;
  /** Still waiting when the run finished. */
  pending: number;
  /** Set when the run stopped because something went wrong. Nothing was lost either way. */
  error: string | null;
}
