# Offline sync design (M6)

The van travels rural routes where mobile signal drops. **If the POS needs internet to print a
bill, the worker goes back to the bill book on day one and the whole project fails.** Offline is
the normal state, not the error state.

## Principle: sales are immutable facts

A sale is an event that already happened. It never needs *merging* — only **exactly-once
insertion**. That single observation removes most of the difficulty:

- The device generates a **UUID** for every sale before it is saved locally.
- The server inserts with `ON CONFLICT (uuid) DO NOTHING`.
- Replaying the same batch of events twice is therefore harmless.

**Balances are never stored — they are derived** from the event log. Two devices can never
disagree about a shop's balance because neither of them owns it.

## The outbox pattern

```
POS device                               Server
  │                                        │
  ├─ sale written to local SQLite          │
  ├─ row appended to `outbox` (pending)    │
  ├─ receipt prints immediately            │
  │   (no network needed)                  │
  │                                        │
  ├── [signal returns] ──────────────────▶ │
  │   POST /sync { events: [...] }         │
  │                                        ├─ INSERT ... ON CONFLICT DO NOTHING
  │ ◀── { accepted: [uuid, ...] } ─────────┤
  ├─ mark those outbox rows as synced      │
```

Nothing is deleted from the outbox until the server confirms the UUID. A crash mid-upload simply
means the events are sent again and ignored the second time.

## Why not CRDTs

There is **one van, one device, one worker**. Genuine concurrent writes to the same record are
almost impossible. The only real conflict is the owner editing a shop's credit in the admin
system while the van is offline, and server-authoritative last-write-wins handles that case.

A conflict-free replicated data type would add significant complexity for a problem this business
does not have. *Knowing when not to reach for a technique is part of the design.*

## Why not a sync library

WatermelonDB and PowerSync would do this for us. The outbox pattern is roughly 300 lines and is
the core engineering content of this module, so it is written by hand.

## Local tables on the device

| Table | Purpose |
|---|---|
| `sale`, `sale_line` | Sales created on this device |
| `payment` | Cash and PayHere receipts against a shop's balance |
| `return` | Returns captured at the shop, with the photo path |
| `outbox` | `uuid`, `event_type`, `payload`, `created_at`, `synced_at` |
| `shop`, `product`, `batch`, `stock` | Read-only cache, refreshed on each successful sync |

Built in `apps/pos/src/storage` — `schema.ts` holds the migrations (append-only, tracked by
`PRAGMA user_version`), `outbox.ts` the queue, `repository.ts` the interface below. SQLite has no
date type, so times are INTEGER epoch milliseconds and money is INTEGER cents, matching the
server. `batch` and `stock` join the cache with M4's end-of-route reconciliation.

A sale deliberately has **no `paid` column**. Cash handed over at the shop is a payment event like
any other, so a balance is always sales minus payments minus return credits, with exactly one way
to count each thing. `saveSale` takes an optional payment and writes both in one transaction, so
the bill and the cash can never come apart.

Balances are derived, never stored: the balance the server last reported, plus every event this
device has not managed to send. `applySyncResult` therefore marks events synced and refreshes the
cached balance **in one transaction** — if it did not, an event could be counted as both pending
and included in the server's figure.

Still to come: the upload itself (the sync engine and its `/sync` endpoint), and the device's
`batch`/`stock` cache.

## Testing

Correctness is proved with **Testcontainers** against a real PostgreSQL instance:

1. Publish a batch of sale events; assert the rows land exactly once.
2. Publish the **same batch twice**; assert no duplicates.
3. Kill the connection mid-upload; reconnect; assert nothing is lost and nothing is duplicated.
4. Create a sale offline and a conflicting admin edit online; assert the documented resolution.

The device half is proved the same way, against a real SQLite database through `node:sqlite`
rather than a mock, so the primary key and the `ON CONFLICT` clause are genuinely exercised:
`apps/pos/test/outbox.test.ts` covers duplicate appends, an upload that dies before the reply
arrives, a partially accepted batch, a replayed reply, and batches larger than one statement.
`repository.test.ts` adds the money rules: a sale saved twice, a bill whose lines do not add up,
a write that fails halfway leaving nothing behind, and a confirmed sale counted once rather than
twice.

## Interface offered to the other POS modules

M4, M5 and M7 build POS screens but never touch the device database directly. They call:

```ts
saveSale(sale: SaleInput): Promise<void>
saveReturn(ret: ReturnInput): Promise<void>
savePayment(payment: PaymentInput): Promise<void>
getRouteShops(routeId: string): Promise<RouteShop[]>
getBalance(shopId: string): Promise<Cents>
getSale(uuid: string): Promise<StoredSale | null> // the reprint on A7
getProducts(): Promise<CachedProduct[]> // the cached price list, wholesale only
getSyncStatus(): Promise<{ pending: number; lastSyncedAt: Date | null }>
applySyncResult(result: SyncResult): Promise<void> // the sync engine's own entry point
```

`PosRepository` in `apps/pos/src/storage/repository.ts`, built on a real database rather than
stubs. The input types are the **device's** shapes (`records.ts`), not the server's: the server's
`sale` and `sale_line` belong to M5 and `return` to M7, so the sync engine maps between the two in
the one place that talks to the server. Screens never change when those APIs land.

Every method is safe to call twice. Saving a uuid that is already stored changes nothing, so a
double tap on a slow screen cannot bill a shop twice.
