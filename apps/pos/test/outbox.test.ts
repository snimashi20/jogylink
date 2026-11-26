import { beforeEach, describe, expect, it } from 'vitest';
import { Outbox } from '../src/storage/outbox';
import { LOCAL_SCHEMA_VERSION, migrateLocalDatabase } from '../src/storage/schema';
import type { OutboxEvent, SqliteDriver } from '../src/storage/types';
import { memorySqlite } from './memory-sqlite';

/** A fixed clock, so "oldest first" and "last synced at" are assertions, not races. */
function clock(start = Date.UTC(2026, 10, 26, 8, 0, 0)) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => void (t += ms),
    at: (ms: number) => new Date(start + ms),
  };
}

function sale(uuid: string, total = 15000): OutboxEvent {
  return { uuid, type: 'sale', payload: { shopId: 'shop-1', totalCents: total } };
}

describe('device outbox', () => {
  let db: SqliteDriver;
  let time: ReturnType<typeof clock>;
  let outbox: Outbox;

  beforeEach(async () => {
    db = memorySqlite();
    await migrateLocalDatabase(db);
    time = clock();
    outbox = new Outbox(db, { now: time.now });
  });

  it('queues a sale and hands it back with its payload intact', async () => {
    expect(await outbox.append(sale('a'))).toBe(true);

    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual({
      uuid: 'a',
      type: 'sale',
      payload: { shopId: 'shop-1', totalCents: 15000 },
      createdAt: time.at(0),
    });
  });

  it('sends events oldest first, breaking same-millisecond ties by insertion order', async () => {
    await outbox.append(sale('first'));
    await outbox.append(sale('second')); // same frozen millisecond as the first
    time.advance(1000);
    await outbox.append(sale('third'));

    expect((await outbox.pending()).map((e) => e.uuid)).toEqual(['first', 'second', 'third']);
  });

  it('ignores the same uuid a second time instead of queueing it twice', async () => {
    expect(await outbox.append(sale('a', 15000))).toBe(true);
    expect(await outbox.append(sale('a', 99999))).toBe(false);

    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    // The first write stands; a retry cannot overwrite a fact already recorded.
    expect(pending[0]?.payload).toEqual({ shopId: 'shop-1', totalCents: 15000 });
  });

  it('stops sending an event once the server has confirmed its uuid', async () => {
    await outbox.append(sale('a'));
    await outbox.append(sale('b'));

    time.advance(60_000);
    expect(await outbox.markSynced(['a'])).toBe(1);

    expect((await outbox.pending()).map((e) => e.uuid)).toEqual(['b']);
    expect(await outbox.status()).toEqual({
      pending: 1,
      needsAttention: 0,
      lastSyncedAt: time.at(60_000),
    });
  });

  it('keeps confirmed events on the device, so a receipt can still be reprinted', async () => {
    await outbox.append(sale('a'));
    await outbox.markSynced(['a']);

    const [row] = await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    expect(row?.n).toBe(1);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('loses and duplicates nothing when the upload dies before the reply arrives', async () => {
    await outbox.append(sale('a'));
    await outbox.append(sale('b'));

    // Signal drops after the POST leaves the device: the batch was read, nothing was confirmed.
    const sent = await outbox.pending();
    expect(sent).toHaveLength(2);

    // The retry sends the same two events, and the server ignores the ones it already has.
    const resent = await outbox.pending();
    expect(resent.map((e) => e.uuid)).toEqual(['a', 'b']);

    await outbox.markSynced(resent.map((e) => e.uuid));
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('replaying the same reply confirms nothing new and does not move the sync time', async () => {
    await outbox.append(sale('a'));
    time.advance(5_000);
    await outbox.markSynced(['a']);
    const first = await outbox.status();

    time.advance(5_000);
    expect(await outbox.markSynced(['a'])).toBe(0);
    expect(await outbox.status()).toEqual(first);
  });

  it('keeps sending the events the server did not accept', async () => {
    await outbox.append(sale('a'));
    await outbox.append(sale('b'));
    await outbox.append(sale('c'));

    // The server accepted two and said nothing about the third.
    expect(await outbox.markSynced(['a', 'c'])).toBe(2);

    expect((await outbox.pending()).map((e) => e.uuid)).toEqual(['b']);
  });

  it('ignores uuids that are not on this device', async () => {
    await outbox.append(sale('a'));
    expect(await outbox.markSynced(['someone-elses-uuid'])).toBe(0);
    expect(await outbox.pendingCount()).toBe(1);
  });

  it('uploads in batches without dropping or reordering anything', async () => {
    const uuids = Array.from({ length: 250 }, (_, i) => `sale-${String(i).padStart(3, '0')}`);
    for (const uuid of uuids) {
      await outbox.append(sale(uuid));
      time.advance(10);
    }

    const firstBatch = await outbox.pending(100);
    expect(firstBatch.map((e) => e.uuid)).toEqual(uuids.slice(0, 100));

    // Confirming more uuids than fit in one SQL statement still marks every one of them.
    expect(await outbox.markSynced(firstBatch.map((e) => e.uuid))).toBe(100);
    expect(await outbox.pendingCount()).toBe(150);
    expect((await outbox.pending(100)).map((e) => e.uuid)).toEqual(uuids.slice(100, 200));
  });

  it('reports an empty queue before anything has ever synced', async () => {
    expect(await outbox.status()).toEqual({ pending: 0, needsAttention: 0, lastSyncedAt: null });
    expect(await outbox.pending()).toEqual([]);
  });

  it('refuses an event with no uuid', async () => {
    await expect(outbox.append({ uuid: '', type: 'sale', payload: {} })).rejects.toThrow(/uuid/);
  });

  describe('pruning', () => {
    it('removes old confirmed events but never an unconfirmed one', async () => {
      await outbox.append(sale('old'));
      await outbox.markSynced(['old']);
      const syncedAt = time.now();

      time.advance(60_000);
      await outbox.append(sale('still-pending'));

      expect(await outbox.pruneSynced(new Date(syncedAt + 1))).toBe(1);
      expect((await outbox.pending()).map((e) => e.uuid)).toEqual(['still-pending']);

      // An unconfirmed sale exists nowhere else, so age is no reason to delete it.
      expect(await outbox.pruneSynced(new Date(time.now() + 10_000_000))).toBe(0);
      expect(await outbox.pendingCount()).toBe(1);
    });
  });

  describe('atomicity with the rows the event describes', () => {
    it('queues nothing if the surrounding transaction fails', async () => {
      await expect(
        db.transaction(async () => {
          await outbox.append(sale('a'));
          throw new Error('writing the sale lines failed');
        }),
      ).rejects.toThrow('writing the sale lines failed');

      expect(await outbox.pendingCount()).toBe(0);
    });

    it('queues the event when the transaction commits', async () => {
      await db.transaction(async () => {
        await outbox.append(sale('a'));
      });
      expect(await outbox.pendingCount()).toBe(1);
    });
  });

  describe('damaged rows', () => {
    it('names the event rather than silently skipping an unreadable payload', async () => {
      await db.run(
        'INSERT INTO outbox (uuid, event_type, payload, created_at) VALUES (?, ?, ?, ?)',
        ['broken', 'sale', 'not json', time.now()],
      );
      await expect(outbox.pending()).rejects.toThrow(/broken/);
    });

    it('names the event rather than guessing at an unknown type', async () => {
      await db.run(
        'INSERT INTO outbox (uuid, event_type, payload, created_at) VALUES (?, ?, ?, ?)',
        ['odd', 'teleport', '{}', time.now()],
      );
      await expect(outbox.pending()).rejects.toThrow(/teleport/);
    });
  });
});

describe('local database migrations', () => {
  it('records the version it reached and is safe to run on every app start', async () => {
    const db = memorySqlite();

    expect(await migrateLocalDatabase(db)).toBe(LOCAL_SCHEMA_VERSION);
    const outbox = new Outbox(db);
    await outbox.append({ uuid: 'a', type: 'sale', payload: {} });

    expect(await migrateLocalDatabase(db)).toBe(LOCAL_SCHEMA_VERSION);
    expect(await outbox.pendingCount()).toBe(1); // a second run does not wipe the queue

    const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LOCAL_SCHEMA_VERSION);
  });

  it('stops when the device holds a database written by a newer app', async () => {
    const db = memorySqlite();
    await db.execute(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION + 1};`);

    await expect(migrateLocalDatabase(db)).rejects.toThrow(/Update the app/);
  });
});
