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

## Shared M4 component

`src/components/QuantityStepper.tsx` provides the POS quantity control (C20). It supports bounded
whole-number entry, increment/decrement buttons, visible validation, and touch targets sized for
field use. Its parent owns the committed value and can keep using it while offline.

`src/screens/LoadVanScreen.tsx` is the presentation layer for POS Load Van. Its parent must supply
route and stock suggestions and persist confirmed quantities through the agreed repository; this
screen does not access local storage or define a sync contract.

## The boundary

**M6 owns everything below the UI** — the local SQLite database, the outbox and the sync engine.
Everyone else calls the repository interface and never touches storage directly:

```ts
saveSale(sale) · saveReturn(ret) · getRouteShops(routeId)
getBalance(shopId) · getSyncStatus()
```

Stub implementations are delivered in week 2 so nobody is blocked.

## Local storage (M6, `src/storage`)

The device database and the outbox. `openDeviceDatabase()` opens the SQLite file and runs the
migrations in `schema.ts`; `PRAGMA user_version` records how far it got, so the call is safe on
every app start. Migrations are append-only — never edit one that has shipped.

`Outbox` is the queue of things that happened in the van and the server has not confirmed:

```ts
append(event) // false if that uuid was already queued — a retry, not an error
pending(limit) // the next events to upload, oldest first
markSynced(uuids) // only ever the uuids the server named as accepted
pendingCount() · status() // { pending, lastSyncedAt } for the sync screen and banner
pruneSynced(before) // drops old confirmed events; never touches an unconfirmed one
```

Call `append` inside the same `db.transaction` as the rows it describes, so a sale can never
exist on the device without its outbox entry.

Everything except `device.ts` is free of React Native, and talks to SQLite through the
`SqliteDriver` port. The tests therefore run on a real SQLite database through `node:sqlite`
(`test/memory-sqlite.ts`) — actual SQL, no phone, nothing to install:

```bash
pnpm --filter @jogylink/pos test
```

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
