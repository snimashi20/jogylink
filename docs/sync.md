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
| `return` | Returns captured at the shop, with the photo path |
| `outbox` | `uuid`, `event_type`, `payload`, `created_at`, `synced_at` |
| `shop`, `product`, `batch`, `stock` | Read-only cache, refreshed on each successful sync |

## Testing

Correctness is proved with **Testcontainers** against a real PostgreSQL instance:

1. Publish a batch of sale events; assert the rows land exactly once.
2. Publish the **same batch twice**; assert no duplicates.
3. Kill the connection mid-upload; reconnect; assert nothing is lost and nothing is duplicated.
4. Create a sale offline and a conflicting admin edit online; assert the documented resolution.

## Interface offered to the other POS modules

M4, M5 and M7 build POS screens but never touch the device database directly. They call:

```ts
saveSale(sale: Sale): Promise<void>
saveReturn(ret: Return): Promise<void>
getRouteShops(routeId: string): Promise<Shop[]>
getBalance(shopId: string): Promise<Money>
getSyncStatus(): { pending: number; lastSyncedAt: Date | null }
```

Delivered with stub implementations in **week 2**, so the other three are never blocked.
