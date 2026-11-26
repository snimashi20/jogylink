import type { Outbox, PosRepository } from '../storage';
import type {
  ConnectivityMonitor,
  SyncApi,
  SyncRunResult,
  SyncState,
  UploadResponse,
} from './types';

/** How many events go up in one request. */
export const DEFAULT_SYNC_BATCH_SIZE = 50;

/** How long to wait after a failed upload, growing to a cap. The van may be out for hours. */
export const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000] as const;

/**
 * After this many failures in a row, send one event per request instead of a batch.
 *
 * If a single event makes the server fall over, a whole batch fails with it and every sale
 * behind it is stuck. Sending them one at a time isolates the bad one: it keeps failing alone,
 * visibly, while the rest get through.
 */
const ISOLATE_AFTER_FAILURES = 3;

/** A guard against spinning forever inside one run; the leftovers go on the next trigger. */
const MAX_BATCHES_PER_RUN = 100;

/** Cancels a scheduled callback. */
export type CancelTimer = () => void;

export interface Scheduler {
  after(ms: number, fn: () => void): CancelTimer;
}

export interface SyncEngineOptions {
  repository: PosRepository;
  outbox: Outbox;
  api: SyncApi;
  connectivity: ConnectivityMonitor;
  now?: () => number;
  batchSize?: number;
  retryDelaysMs?: readonly number[];
  scheduler?: Scheduler;
}

const realScheduler: Scheduler = {
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};

/**
 * Gets what happened in the van onto the server, exactly once, without ever losing it.
 *
 * The rules, in the order they matter:
 *
 *  1. **Nothing is deleted, ever.** Not on a 400, not on a 500, not after a hundred failures.
 *     An unsent event is a sale that exists nowhere else in the world.
 *  2. **Only the server's word marks an event sent.** The engine marks exactly the uuids the
 *     server named, never the batch it hopefully posted.
 *  3. **A failed upload changes nothing but the error message.** The queue is untouched, so a
 *     retry — or a crash and a restart — simply sends the same events again, and the server's
 *     `ON CONFLICT DO NOTHING` ignores what it already has.
 *  4. **An event the server refuses is quarantined, not dropped.** It leaves the queue so it
 *     cannot block the sales behind it, and it is listed for a person to deal with.
 *
 * Rule 1 is written down because the reference implementation this replaces deleted pending
 * transactions on 400, 422 and 500 — which turns a server bug into lost money.
 */
export class SyncEngine {
  private readonly now: () => number;
  private readonly batchSize: number;
  private readonly retryDelays: readonly number[];
  private readonly scheduler: Scheduler;

  private listeners = new Set<() => void>();
  private unsubscribeConnectivity: (() => void) | null = null;
  private cancelRetry: CancelTimer | null = null;
  private inFlight: Promise<SyncRunResult> | null = null;
  private consecutiveFailures = 0;

  private state: SyncState;

  constructor(private readonly options: SyncEngineOptions) {
    this.now = options.now ?? (() => Date.now());
    this.batchSize = options.batchSize ?? DEFAULT_SYNC_BATCH_SIZE;
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.scheduler = options.scheduler ?? realScheduler;
    this.state = {
      phase: 'idle',
      connected: options.connectivity.isConnected(),
      pending: 0,
      needsAttention: 0,
      lastSyncedAt: null,
      lastAttemptAt: null,
      lastError: null,
      lastUploaded: 0,
      nextRetryAt: null,
    };
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Starts watching. Call once when the app opens.
   *
   * Signal coming back is the trigger that matters: that is the moment a morning's sales can
   * finally go up, and the worker should not have to ask for it.
   */
  async start(): Promise<void> {
    this.unsubscribeConnectivity ??= this.options.connectivity.subscribe((connected) => {
      this.patch({ connected });
      if (connected) void this.syncNow();
      else this.stopWaiting();
    });

    await this.refreshCounts();
    if (this.state.connected) await this.syncNow();
  }

  stop(): void {
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
    this.stopWaiting();
  }

  /**
   * Uploads everything waiting. Safe to call at any time and from anywhere — the manual retry
   * button, a connectivity change, app start. Calls that arrive while a run is going join it
   * rather than starting a second one, so events are never in two requests at once.
   */
  syncNow(): Promise<SyncRunResult> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Re-reads the counts from the database, for a screen that has just opened. */
  async refresh(): Promise<SyncState> {
    await this.refreshCounts();
    return this.state;
  }

  private async run(): Promise<SyncRunResult> {
    this.stopWaiting();
    await this.refreshCounts();

    if (!this.options.connectivity.isConnected()) {
      this.patch({ phase: this.state.pending > 0 ? 'offline' : 'idle' });
      return { uploaded: 0, rejected: 0, pending: this.state.pending, error: null };
    }

    this.patch({ phase: 'syncing', lastUploaded: 0 });

    let uploaded = 0;
    let rejected = 0;

    for (let batchNo = 0; batchNo < MAX_BATCHES_PER_RUN; batchNo += 1) {
      // One event at a time once something is clearly wrong, so a single bad event cannot hold
      // up everything else.
      const limit = this.consecutiveFailures >= ISOLATE_AFTER_FAILURES ? 1 : this.batchSize;
      const batch = await this.options.outbox.pending(limit);
      if (batch.length === 0) break;

      const uuids = batch.map((event) => event.uuid);
      let response: UploadResponse;

      try {
        response = await this.options.api.upload(batch);
      } catch (error) {
        // Might work later: no signal, a timeout, a 500, a reply that did not parse. The queue
        // is left exactly as it was.
        const message = describe(error);
        await this.options.outbox.recordAttempt(uuids, message);
        this.consecutiveFailures += 1;
        await this.refreshCounts();
        this.scheduleRetry();
        this.patch({
          lastAttemptAt: new Date(this.now()),
          lastError: message,
          lastUploaded: uploaded,
        });
        return { uploaded, rejected, pending: this.state.pending, error: message };
      }

      // Confirmations and the refreshed cache land together, so a balance is never counted twice.
      const { confirmed } = await this.options.repository.applySyncResult({
        acceptedUuids: response.accepted,
        shops: response.shops,
        products: response.products,
      });

      const quarantined = await this.options.outbox.recordRejections(response.rejected ?? []);
      // Anything the server neither accepted nor refused stays queued; this just records that we
      // tried, so the screen can show an event that keeps going nowhere.
      await this.options.outbox.recordAttempt(uuids, null);

      uploaded += confirmed;
      rejected += quarantined;

      // Progress is counted from what the database actually changed, never from the length of
      // the server's `accepted` list. A server that keeps naming an event it already has would
      // otherwise keep this loop going, burning requests on a connection that costs money.
      if (confirmed === 0 && quarantined === 0) {
        // The server answered but took nothing. Sending the same batch again immediately would
        // spin, so treat it as a failure and wait.
        const message = 'The server accepted none of the events it was sent.';
        this.consecutiveFailures += 1;
        await this.options.outbox.recordAttempt(uuids, message);
        await this.refreshCounts();
        this.scheduleRetry();
        this.patch({
          lastAttemptAt: new Date(this.now()),
          lastError: message,
          lastUploaded: uploaded,
        });
        return { uploaded, rejected, pending: this.state.pending, error: message };
      }

      this.consecutiveFailures = 0;
    }

    await this.refreshCounts();
    this.patch({
      phase: 'idle',
      lastAttemptAt: new Date(this.now()),
      lastError: null,
      lastUploaded: uploaded,
      nextRetryAt: null,
    });

    return { uploaded, rejected, pending: this.state.pending, error: null };
  }

  private scheduleRetry(): void {
    const index = Math.min(this.consecutiveFailures - 1, this.retryDelays.length - 1);
    const delay = this.retryDelays[Math.max(index, 0)] ?? 0;

    this.stopWaiting();
    this.cancelRetry = this.scheduler.after(delay, () => {
      this.cancelRetry = null;
      if (this.options.connectivity.isConnected()) void this.syncNow();
      else this.patch({ phase: 'offline', nextRetryAt: null });
    });

    this.patch({ phase: 'retrying', nextRetryAt: new Date(this.now() + delay) });
  }

  private stopWaiting(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
    if (this.state.nextRetryAt !== null) this.patch({ nextRetryAt: null });
  }

  private async refreshCounts(): Promise<void> {
    const status = await this.options.repository.getSyncStatus();
    this.patch({
      connected: this.options.connectivity.isConnected(),
      pending: status.pending,
      needsAttention: status.needsAttention,
      lastSyncedAt: status.lastSyncedAt,
    });
  }

  private patch(next: Partial<SyncState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
}

/** Whatever went wrong, in one line the worker could read out over the phone. */
function describe(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return 'The upload failed for an unknown reason.';
}
