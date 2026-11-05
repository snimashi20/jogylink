# apps/pos — Mobile POS (React Native + Expo)

Runs on an Android handheld POS device with a built-in thermal printer and camera. Carried on the
van. **Must work completely offline** — see [docs/sync.md](../../docs/sync.md).

Expo **dev build**, not Expo Go, because the printer and camera need native modules.

## Screens and owners

| Screen | Owner |
|---|---|
| Login | M1 |
| Load Van · End-of-Route Reconciliation | M4 |
| Shop Select · Billing · Payment · Signature Prompt | M5 |
| Route List · Sync Status | M6 |
| Add Return · Partial Return | M7 |

## The boundary

**M6 owns everything below the UI** — the local SQLite database, the outbox and the sync engine.
Everyone else calls the repository interface and never touches storage directly:

```ts
saveSale(sale) · saveReturn(ret) · getRouteShops(routeId)
getBalance(shopId) · getSyncStatus()
```

Stub implementations are delivered in week 2 so nobody is blocked.

## Non-negotiables

- Every screen renders and functions with **no network**.
- The receipt prints **locally** from the device, never from the server.
- Touch targets are **64 × 64 px** minimum; body text 18 px minimum (sunlight, one hand, hurry).
- The offline banner is **amber, not red** — offline is normal on a rural route, and a red alarm
  several times a day trains the worker to ignore warnings.
