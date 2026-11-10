# apps/api — NestJS backend

One NestJS module per team member. Each owner works only inside their own folder.

| Folder | Owner | Contains |
|---|---|---|
| `auth/`, `products/`, `settings/` | **M1** | Auth, roles, the two-price engine, system settings |
| `suppliers/`, `batches/` | **M2** | Goods received, supplier records, quality ratings |
| `expiry/`, `reordering/` | **M3** | Expiry classifier, FEFO picker, reorder calculator, alerts |
| `stock/`, `shops/`, `routes/` | **M4** | Five stock locations, shops, routes, van loading |
| `sales/` | **M5** | Sale transaction, price-type handling, receipt generation |
| `sync/`, `credit/`, `payments/` | **M6** | Sync endpoint, credit ledger, PayHere |
| `returns/`, `claims/` | **M7** | Return capture, partial returns, supplier claims |
| `weborders/`, `sms/`, `delivery/` | **M8** | Website orders, SMS gateway, COD, courier |

Shared request and response types live in `packages/shared` and are frozen after week 1.

## Running it

```bash
cp .env.example .env     # then set JWT_SECRET (see the comment in the file)
docker compose up -d     # PostgreSQL
pnpm --filter @jogylink/db db:migrate
pnpm --filter @jogylink/db db:seed
pnpm --filter @jogylink/api dev
```

The API listens on `http://localhost:3001/api`.

## Authentication (M1) — what every other member needs to know

**Every route is private by default.** The login guard and the role guard are registered globally
in `auth/auth.module.ts`, so a new controller needs no setup to be protected.

```ts
import { Public, Roles, CurrentUser } from '../auth/decorators';

@Get('prices')                 // any signed-in user (owner or worker)
@Roles('owner') @Get('profit') // owner only
@Public() @Get('catalogue')    // no login needed (e.g. the public website)
list(@CurrentUser() user: AuthUser) { ... }
```

| Endpoint | Who | What |
|---|---|---|
| `POST /api/auth/login` | public | `{ username, password }` → `{ accessToken, user }` |
| `GET /api/auth/me` | signed in | The current user |
| `GET /api/health` | public | `{ status: "ok" }` |

Clients send `Authorization: Bearer <accessToken>`. Notes:

- The token holds only the user id. Role and active status are read from the database on **every
  request**, so deactivating a user or changing a role takes effect immediately.
- Unknown user, wrong password and deactivated account all return the same `401` message.
- After `LOGIN_MAX_ATTEMPTS` wrong passwords in a row (per IP + username) login returns `429`.
  The count is held in memory, which is fine for one API instance.
- There is no logout endpoint: the token is stateless, so the client just discards it.

## Settings and products (M1)

| Endpoint | Who | What |
|---|---|---|
| `GET /api/settings` | signed in | All settings (markup, expiry stages, claim triggers) |
| `PUT /api/settings/:key` | owner | Change one setting: `{ "value": 1.15 }` |
| `GET /api/products` | owner | All products with **both** prices (screen A2) |
| `GET /api/products/pos` | signed in | Active products, **wholesale price only** (the POS) |
| `POST /api/products` | owner | Create. SKU is trimmed and upper-cased; duplicate SKU returns `409` |
| `PATCH /api/products/:id` | owner | Update. `retailMarkupOverride: null` goes back to the system markup |

There is no DELETE: batches and sales will point at products, so switch one off with
`PATCH { "active": false }`.

**Reading settings from your own module:**

```ts
constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}
const markup = await this.settings.get('retail_markup'); // typed as number
```

Import `SettingsModule` in your module to inject it. Reads always hit the database, so a change by
the owner applies to the very next request. The expiry stages are kept in order
(green > yellow > orange); a change that breaks the order is rejected with `422`.

**For M8 (website):** `ProductsService.listForWeb()` returns active products with the **retail
price only**. Build your own controller on top of it and never return wholesale prices.

