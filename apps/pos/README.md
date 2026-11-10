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

## Sign-in (M1)

- Signing in needs the server once. After that the session is kept in the phone's secure store and the app opens straight into the app with no signal.
- Not reaching the server never signs anyone out. Only the server answering 401 does (expired login, or the owner switched the account off). Any request that gets a 401 should go through `authorizedFetch` in `src/auth`, which returns the person to the sign-in screen.
- M6: set `guardSignOut` in `src/auth/index.ts` so signing out is blocked while sales are unsent.
- Set the API address with `EXPO_PUBLIC_API_URL` (default `http://10.0.2.2:3001/api` for the Android emulator).
- Run `pnpm --filter @jogylink/pos test` for the sign-in logic tests.
