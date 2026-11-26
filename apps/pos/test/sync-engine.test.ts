import { beforeEach, describe, expect, it } from 'vitest';
import { Outbox } from '../src/storage/outbox';
import type { SaleInput } from '../src/storage/records';
import { SqlitePosRepository, type PosRepository } from '../src/storage/repository';
import { migrateLocalDatabase } from '../src/storage/schema';
import type { PendingEvent, SqliteDriver } from '../src/storage/types';
import { SyncEngine } from '../src/sync/engine';
import type { ConnectivityMonitor, SyncApi, UploadResponse } from '../src/sync/types';
import { memorySqlite } from './memory-sqlite';

const START = Date.UTC(2026, 10, 26, 8, 0, 0);
const RETRY_DELAYS = [5_000, 15_000, 60_000] as const;

function clock(start = START) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function sale(uuid: string, shopId = 'shop-1', cents = 15000): SaleInput {
  return {
    uuid,
    shopId,
    userId: 'worker-1',
    soldAt: new Date(START),
    totalCents: cents,
    lines: [
      {
        productId: 'product-1',
        batchId: null,
        unitType: 'piece',
        quantity: 1,
        unitPriceCents: cents,
        lineTotalCents: cents,
      },
    ],
  };
}

/** Connectivity the test drives by hand. */
function fakeConnectivity(initial = true) {
  let connected = initial;
  const listeners = new Set<(connected: boolean) => void>();
  return {
    isConnected: () => connected,
    subscribe(listener: (connected: boolean) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: boolean) {
      connected = next;
      listeners.forEach((listener) => listener(next));
    },
  } satisfies ConnectivityMonitor & { set(next: boolean): void };
}

/** A server the test can make behave any way it likes, recording what it was sent. */
function fakeApi() {
  const calls: PendingEvent[][] = [];
  let behaviour: (events: readonly PendingEvent[]) => Promise<UploadResponse> = async (events) => ({
    accepted: events.map((event) => event.uuid),
  });

  return {
    calls,
    set(next: typeof behaviour) {
      behaviour = next;
    },
    /** Fails every time, like a server that is down. */
    failWith(message: string) {
      behaviour = async () => {
        throw new Error(message);
      };
    },
    api: {
      async upload(events: readonly PendingEvent[]): Promise<UploadResponse> {
        calls.push([...events]);
        return behaviour(events);
      },
    } satisfies SyncApi,
  };
}

/** Timers the test fires itself, so backoff is asserted rather than waited for. */
function manualScheduler() {
  const queue: { ms: number; fn: () => void }[] = [];
  return {
    delays: () => queue.map((entry) => entry.ms),
    after(ms: number, fn: () => void) {
      const entry = { ms, fn };
      queue.push(entry);
      return () => {
        const at = queue.indexOf(entry);
        if (at >= 0) queue.splice(at, 1);
      };
    },
    /** Fires the next timer. The caller then awaits the engine to let the run finish. */
    fire() {
      queue.shift()?.fn();
    },
  };
}

describe('sync engine', () => {
  let db: SqliteDriver;
  let time: ReturnType<typeof clock>;
  let outbox: Outbox;
  let repo: PosRepository;
  let net: ReturnType<typeof fakeConnectivity>;
  let server: ReturnType<typeof fakeApi>;
  let scheduler: ReturnType<typeof manualScheduler>;
  let engine: SyncEngine;

  beforeEach(async () => {
    db = memorySqlite();
    await migrateLocalDatabase(db);
    time = clock();
    outbox = new Outbox(db, { now: time.now });
    repo = new SqlitePosRepository(db, { now: time.now, outbox });
    net = fakeConnectivity(true);
    server = fakeApi();
    scheduler = manualScheduler();
    engine = new SyncEngine({
      repository: repo,
      outbox,
      api: server.api,
      connectivity: net,
      now: time.now,
      batchSize: 50,
      retryDelaysMs: RETRY_DELAYS,
      scheduler,
    });
  });

  describe('a good upload', () => {
    it('sends what is waiting and marks exactly what the server confirmed', async () => {
      await repo.saveSale(sale('sale-1'));
      await repo.saveSale(sale('sale-2'));

      time.advance(1000);
      const run = await engine.syncNow();

      expect(run).toEqual({ uploaded: 2, rejected: 0, pending: 0, error: null });
      expect(await repo.getSyncStatus()).toEqual({
        pending: 0,
        needsAttention: 0,
        lastSyncedAt: new Date(START + 1000),
      });
      expect(engine.getState().phase).toBe('idle');
      expect(engine.getState().lastError).toBeNull();
    });

    it('keeps sending the events the server did not mention', async () => {
      await repo.saveSale(sale('sale-1'));
      await repo.saveSale(sale('sale-2'));
      server.set(async () => ({ accepted: ['sale-1'] }));

      const run = await engine.syncNow();

      // The second event is still queued, and the run stopped rather than spinning.
      expect(run.uploaded).toBe(1);
      expect((await outbox.pending()).map((e) => e.uuid)).toEqual(['sale-2']);

      server.set(async (events) => ({ accepted: events.map((e) => e.uuid) }));
      await engine.syncNow();
      expect(await outbox.pendingCount()).toBe(0);
    });

    it('confirming an event the device already marked changes nothing', async () => {
      await repo.saveSale(sale('sale-1'));
      await engine.syncNow();
      const after = await repo.getSyncStatus();

      // The server replays its acceptance on the next sync, as it may after a retry.
      time.advance(10_000);
      await repo.saveSale(sale('sale-2'));
      server.set(async () => ({ accepted: ['sale-1', 'sale-2'] }));
      await engine.syncNow();

      expect(await repo.getSale('sale-1')).not.toBeNull();
      expect(await outbox.unsentCount()).toBe(0);
      expect(after.lastSyncedAt).not.toBeNull();
    });

    it('applies the refreshed cache, so a confirmed sale is not counted twice', async () => {
      await repo.applySyncResult({
        acceptedUuids: [],
        shops: [
          {
            id: 'shop-1',
            code: 'S001',
            name: 'Lanka Stores',
            creditLimitCents: 500000,
            routeId: 'route-1',
            visitOrder: 1,
            isActive: true,
            serverBalanceCents: 20000,
          },
        ],
      });
      await repo.saveSale(sale('sale-1', 'shop-1', 15000));
      expect(await repo.getBalance('shop-1')).toBe(35000);

      server.set(async (events) => ({
        accepted: events.map((e) => e.uuid),
        shops: [
          {
            id: 'shop-1',
            code: 'S001',
            name: 'Lanka Stores',
            creditLimitCents: 500000,
            routeId: 'route-1',
            visitOrder: 1,
            isActive: true,
            serverBalanceCents: 35000,
          },
        ],
      }));
      await engine.syncNow();

      expect(await repo.getBalance('shop-1')).toBe(35000);
      expect(await outbox.pendingCount()).toBe(0);
    });

    it('sends large queues in batches', async () => {
      for (let i = 0; i < 120; i += 1) await repo.saveSale(sale(`sale-${i}`));

      const run = await engine.syncNow();

      expect(run.uploaded).toBe(120);
      expect(server.calls.map((batch) => batch.length)).toEqual([50, 50, 20]);
    });
  });

  describe('when the upload fails', () => {
    it('loses nothing, marks nothing, and records why', async () => {
      await repo.saveSale(sale('sale-1'));
      server.failWith('connection reset');

      const run = await engine.syncNow();

      expect(run.error).toBe('connection reset');
      expect(run.uploaded).toBe(0);
      expect(await outbox.pendingCount()).toBe(1); // still queued, nothing deleted
      expect(await repo.getSale('sale-1')).not.toBeNull();
      expect(engine.getState().lastError).toBe('connection reset');
      expect(engine.getState().phase).toBe('retrying');

      const [row] = await db.all<{ attempts: number; last_error: string }>(
        'SELECT attempts, last_error FROM outbox WHERE uuid = ?',
        ['sale-1'],
      );
      expect(row?.attempts).toBe(1);
      expect(row?.last_error).toBe('connection reset');
    });

    it('keeps a sale through a server error, an app restart and a retry', async () => {
      await repo.saveSale(sale('sale-1'));
      server.failWith('500 Internal Server Error');
      await engine.syncNow();

      // The app is killed and reopened: a fresh engine over the same database file.
      const restarted = new SyncEngine({
        repository: new SqlitePosRepository(db, { now: time.now }),
        outbox: new Outbox(db, { now: time.now }),
        api: server.api,
        connectivity: net,
        now: time.now,
        retryDelaysMs: RETRY_DELAYS,
        scheduler,
      });
      await restarted.refresh();
      expect(restarted.getState().pending).toBe(1);

      server.set(async (events) => ({ accepted: events.map((e) => e.uuid) }));
      const run = await restarted.syncNow();

      expect(run.uploaded).toBe(1);
      expect(await outbox.unsentCount()).toBe(0);
    });

    it('waits longer after each failure, and tries again when the timer fires', async () => {
      await repo.saveSale(sale('sale-1'));
      server.failWith('no route to host');

      await engine.syncNow();
      expect(scheduler.delays()).toEqual([RETRY_DELAYS[0]]);

      scheduler.fire();
      await engine.syncNow();
      expect(scheduler.delays()).toEqual([RETRY_DELAYS[1]]);

      scheduler.fire();
      await engine.syncNow();
      expect(scheduler.delays()).toEqual([RETRY_DELAYS[2]]);

      // And the one that works clears the error.
      server.set(async (events) => ({ accepted: events.map((e) => e.uuid) }));
      scheduler.fire();
      await engine.syncNow();

      expect(engine.getState().lastError).toBeNull();
      expect(engine.getState().phase).toBe('idle');
      expect(await outbox.pendingCount()).toBe(0);
    });

    it('falls back to one event per request so a bad event cannot block the rest', async () => {
      for (const uuid of ['a', 'b', 'c']) await repo.saveSale(sale(uuid));
      server.failWith('the server fell over');

      // Three failures in a row is the signal to stop batching, so the fourth attempt is the
      // first one sent singly.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await engine.syncNow();
        scheduler.fire();
      }

      // The first attempts went as a batch; once it was clearly not working, one at a time.
      expect(server.calls[0]?.length).toBe(3);
      expect(server.calls.at(-1)?.length).toBe(1);
      expect(await outbox.pendingCount()).toBe(3); // and all three are still here
    });

    it('treats a reply that accepts nothing as a failure rather than looping', async () => {
      await repo.saveSale(sale('sale-1'));
      server.set(async () => ({ accepted: [] }));

      const run = await engine.syncNow();

      expect(run.error).toMatch(/accepted none/);
      expect(server.calls).toHaveLength(1);
      expect(await outbox.pendingCount()).toBe(1);
      expect(scheduler.delays()).toEqual([RETRY_DELAYS[0]]);
    });
  });

  describe('an event the server refuses', () => {
    it('is quarantined for a person, never deleted', async () => {
      await repo.saveSale(sale('sale-1'));
      await repo.saveSale(sale('sale-2'));
      server.set(async () => ({
        accepted: ['sale-2'],
        rejected: [{ uuid: 'sale-1', reason: 'Shop 404 is not on this route.' }],
      }));

      const run = await engine.syncNow();

      expect(run).toEqual({ uploaded: 1, rejected: 1, pending: 0, error: null });

      // Out of the queue so it blocks nothing...
      expect(await outbox.pendingCount()).toBe(0);
      // ...but still on the device, and counted as unsent.
      expect(await outbox.unsentCount()).toBe(1);
      expect(await repo.getSale('sale-1')).not.toBeNull();

      const status = await repo.getSyncStatus();
      expect(status.needsAttention).toBe(1);

      const [flagged] = await repo.getRejectedEvents();
      expect(flagged?.uuid).toBe('sale-1');
      expect(flagged?.reason).toBe('Shop 404 is not on this route.');
      expect(flagged?.type).toBe('sale');
    });

    it('is not retried on its own, only when a person asks', async () => {
      await repo.saveSale(sale('sale-1'));
      server.set(async () => ({
        accepted: [],
        rejected: [{ uuid: 'sale-1', reason: 'Bad shop id.' }],
      }));
      await engine.syncNow();

      server.calls.length = 0;
      await engine.syncNow();
      expect(server.calls).toHaveLength(0); // left alone

      // The owner fixed the shop record; the worker presses retry.
      expect(await repo.retryRejected()).toBe(1);
      server.set(async (events) => ({ accepted: events.map((e) => e.uuid) }));
      const run = await engine.syncNow();

      expect(run.uploaded).toBe(1);
      expect(await outbox.unsentCount()).toBe(0);
      expect(await repo.getRejectedEvents()).toEqual([]);
    });

    it('cannot be marked refused once the server has accepted it', async () => {
      await repo.saveSale(sale('sale-1'));
      await engine.syncNow();

      server.set(async () => ({
        accepted: [],
        rejected: [{ uuid: 'sale-1', reason: 'A late contradictory answer.' }],
      }));
      await repo.saveSale(sale('sale-2'));
      await engine.syncNow();

      expect((await repo.getRejectedEvents()).map((e) => e.uuid)).not.toContain('sale-1');
    });
  });

  describe('offline behaviour', () => {
    it('does not call the server at all with no connection', async () => {
      await repo.saveSale(sale('sale-1'));
      net.set(false);

      const run = await engine.syncNow();

      expect(server.calls).toHaveLength(0);
      expect(run).toEqual({ uploaded: 0, rejected: 0, pending: 1, error: null });
      expect(engine.getState().phase).toBe('offline');
    });

    it('sends the morning by itself the moment signal comes back', async () => {
      net.set(false);
      await engine.start();
      await repo.saveSale(sale('sale-1'));
      await repo.saveSale(sale('sale-2'));
      expect(server.calls).toHaveLength(0);

      net.set(true);
      await engine.syncNow(); // joins the run the connectivity change started

      expect(await outbox.pendingCount()).toBe(0);
      expect(engine.getState().connected).toBe(true);
      engine.stop();
    });

    it('stops watching when told to', async () => {
      await engine.start();
      engine.stop();

      await repo.saveSale(sale('sale-1'));
      server.calls.length = 0;
      net.set(true);

      expect(server.calls).toHaveLength(0);
    });
  });

  describe('running once at a time', () => {
    it('joins a run already in progress instead of sending twice', async () => {
      await repo.saveSale(sale('sale-1'));

      const [first, second] = await Promise.all([engine.syncNow(), engine.syncNow()]);

      expect(server.calls).toHaveLength(1);
      expect(first).toEqual(second);
    });
  });

  it('tells the screen whenever anything changes', async () => {
    let notifications = 0;
    const unsubscribe = engine.subscribe(() => {
      notifications += 1;
    });

    await repo.saveSale(sale('sale-1'));
    await engine.syncNow();

    expect(notifications).toBeGreaterThan(0);
    expect(engine.getState().lastUploaded).toBe(1);
    unsubscribe();
  });
});
