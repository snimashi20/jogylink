# M6 — record of code reused from OneShopPOS

OneShopPOS (`https://github.com/Malze-26/OneShopPOS`) was reviewed as a read-only reference for
M6. Nothing in it was modified. This file records, per feature, what was actually reusable — and
where the reference was deliberately not followed.

The honest summary for the offline sync work: **no code was reused, only ideas.** The reference's
offline layer is about 100 lines across four files, written for a browser with IndexedDB and a
different correctness goal, and one of its behaviours loses money. It is recorded here so the
decision is traceable rather than implicit.

## Offline sync (phases 2 and 3)

| OneShop source | What it does | Reused | JogyLink implementation |
|---|---|---|---|
| `frontend/app/lib/syncManager.ts` | Loops pending transactions, POSTs each one, deletes on success — and **deletes on 400, 422 and 500** | The loop-and-tally shape only | `apps/pos/src/sync/engine.ts` |
| `frontend/app/lib/offlineDB.ts` | IndexedDB store of pending transactions, keyed by a `localId` the store invents at save time | Nothing | `apps/pos/src/storage/outbox.ts`, `schema.ts` |
| `frontend/app/hooks/useOnlineStatus.ts` | `navigator.onLine` plus `online`/`offline` window events | The idea of reacting to connectivity changes | `apps/pos/src/sync/netinfo.ts` |
| `frontend/app/hooks/useSyncState.ts` | A `useState` bag: count, syncing flag, message | Nothing — it holds no logic | `SyncState` in `apps/pos/src/sync/types.ts` |

### Why the storage layer could not be adapted

OneShop generates its key **inside the store at save time**
(`local-${Date.now()}-${Math.random()}`) and sends the record without it. JogyLink generates a
**UUID on the device before anything is saved**, and that same uuid is the primary key on the
server. That difference is the whole basis of exactly-once delivery: it is what lets the server
insert with `ON CONFLICT (uuid) DO NOTHING` and lets the device replay a batch safely. A key
invented by the store at save time cannot do that job, so the storage layer is new code.

IndexedDB → SQLite also removes any shared API, and a browser store is not available in a React
Native app at all.

### Why `syncManager.ts` was treated as an anti-pattern

```ts
// OneShopPOS/frontend/app/lib/syncManager.ts
if (status === 400 || status === 422 || status === 500) {
  console.warn(`Dropping unrecoverable pending transaction: ${transaction.localId}`);
  await deletePendingTransaction(transaction.localId);
}
```

A 500 is a **server** fault. A 400 is usually a bug in the client's own request. Treating either
as "unrecoverable" and deleting the record destroys a sale that exists nowhere else — the shop has
a signed paper receipt and the business has nothing. One server deployment with a validation bug
would quietly erase a day of a route.

JogyLink's engine instead:

- **never deletes**, on any status or after any number of attempts;
- marks only the uuids the server explicitly acknowledged, not the batch it posted;
- treats transport failures, 5xx and unparseable replies as retryable, with backoff;
- **quarantines** an event the server explicitly refuses, with its reason, so it stops blocking
  the queue but stays on the device and is listed for a person — only an explicit action retries
  it;
- keeps `attempts`, `last_attempt_at` and `last_error` in the outbox, so the sync screen can
  explain itself after a restart.

Two further differences worth noting, both learned from reading the reference rather than copied:

- OneShop posts **one transaction per request**. JogyLink batches, because a van uploads a whole
  morning at once when signal returns. It falls back to one event per request after three
  consecutive failures, so a single bad event cannot hold up everything behind it.
- `navigator.onLine` (and NetInfo's `isConnected`) only means a network interface exists. On a
  rural route a phone attaches to a tower with no working data path and still reports connected,
  so `netinfo.ts` uses `isInternetReachable` and the engine treats a failed upload as the stronger
  signal.

## Still to review

The transaction, customer, dashboard, report and UI references listed in the M6 brief have not
been read yet; they belong to the credit ledger, PayHere and frontend phases. This file is
extended as each phase is built.
