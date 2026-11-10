# Building on the M1 foundation

Written by M1 (Nethmini) for the other seven modules. Read it once before you write your first
endpoint or screen. It covers what M1 already gives you, so you do not rebuild it, and the few
rules that keep everyone's work compatible.

Some of this lives in pull requests that are still being reviewed. Once they are merged into
`main`, everything below exists on your machine after `git pull`.

## 1. What you get for free

| You need | It already exists | Where |
|---|---|---|
| Login, sessions, "who is calling" | Global guards, every route is private by default | `apps/api/src/auth` |
| Owner-only vs worker routes | `@Roles('owner')` | `apps/api/src/auth/decorators.ts` |
| Business numbers (markup, expiry days, claim triggers) | `SettingsService.get('key')` | `apps/api/src/settings` |
| Product list, wholesale and retail price | `ProductsService` | `apps/api/src/products` |
| Retail price maths | `resolveRetailPriceCents()` | `packages/shared/src/pricing.ts` |
| Request validation | Zod schemas plus `ZodValidationPipe` | `packages/shared`, `apps/api/src/common` |
| A real test database | `createTestApp()` (PostgreSQL in memory) | `apps/api/test/helpers/test-app.ts` |
| Buttons, form fields, dialogs | `@jogylink/ui` (C1, C9, C10) | `packages/ui` |
| Admin pages: login, nav, session | Next.js app, `(admin)` route group | `apps/web` |

## 2. Adding an API endpoint

1. Put the **shape of the data** in `packages/shared/src` first (a Zod schema and its type). The API
   and the screens both use it, so they can never disagree.
2. Make a module folder: `apps/api/src/<thing>/` with `<thing>.module.ts`, `.controller.ts`,
   `.service.ts`.
3. Register the module in `apps/api/src/app.module.ts` (`imports: [...]`).
4. Validate input with the pipe: `@Body(new ZodValidationPipe(MySchema)) body: MyType`.
5. Write a test next to the others in `apps/api/test/` using `createTestApp()` (section 7).

**Always write `@Inject(...)` on constructor parameters.** The test runner does not emit the type
information Nest normally relies on, so a missing `@Inject` fails with "can't resolve dependencies".

```ts
@Injectable()
export class StockService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}
}
```

If your module needs settings or products, import their module:
`@Module({ imports: [SettingsModule], ... })`. Both export their service.

## 3. Who is allowed in

**Every route needs a login unless you say otherwise.** You do not add a guard; it is global.

```ts
import { CurrentUser, Public, Roles } from '../auth/decorators';

@Get('health')  @Public()                      // no login needed (the public website)
@Roles('owner') @Get('reports')                // owner only; a worker gets 403
@Get('me/stuff') list(@CurrentUser() user: AuthUser) { ... }   // any signed-in user
```

- `@Roles('owner')` also works on a whole controller.
- Two roles only: `owner` and `worker`. The worker uses the POS; the owner uses the website.
- The role is read from the database on every request, never trusted from the token. Switching a
  user off locks them out immediately.
- A route with no decorators is open to **any signed-in user**. If a route must be owner-only, say
  so. Write a test that a worker gets 403.
- Public website routes (M8) need `@Public()` and must never return wholesale prices (section 4).

## 4. Prices: the two-price rule

> Only the **wholesale** price is stored. The retail (website) price is **derived**:
> `wholesale x markup`, where the markup is the product's own override, else the shop-wide setting.

- Never add a retail price column, and never store a computed retail price anywhere.
- Never calculate it yourself. Use `ProductsService`, or call `resolveRetailPriceCents()`.
- Which view to use:

| Audience | Method | Price they see |
|---|---|---|
| Owner admin | `products.list()` | both |
| POS (van) | `products.listForPos()` | wholesale only |
| Public website | `products.listForWeb()` | retail only |

- **Money is integer cents inside code** (Rs 150.00 = `15000`). Convert at the edge with
  `toCents()` / `fromCents()` from `@jogylink/shared`. Never add up floating-point rupees.
- Products are never deleted. An old product is switched off (`active: false`) so sales history that
  points at it stays valid. Users work the same way.

## 5. Settings: no magic numbers

Do not hard-code a threshold. Read it:

```ts
const green = await this.settings.get('expiry_green_min_days'); // typed as number
```

| Key | Default | Used by |
|---|---|---|
| `retail_markup` | 1.10 | website prices (M1, M8) |
| `expiry_green_min_days` | 46 | expiry stages (M3) |
| `expiry_yellow_min_days` | 22 | expiry stages (M3) |
| `expiry_orange_min_days` | 8 | expiry stages (M3) |
| `claim_value_trigger` | 5000 | supplier claims (M7) |
| `claim_age_trigger_days` | 14 | supplier claims (M7) |

The owner edits these in the Settings screen, and the next request sees the change. Reads always hit
the database, so do not cache them across requests.

**Expiry stages (M3):** green is 46 or more days left, yellow 22 to 45, orange 8 to 21, and **red is
7 days or fewer and is blocked from every sale**. The design guide shows slightly different numbers;
M3 owns that decision, and the owner can change the values in Settings anyway.

If you need a new setting, add it to `SETTING_DEFINITIONS` in `packages/shared/src/setting.ts` (key,
default, Zod rule). It appears in the API and the Settings screen's data automatically; ask M1 to add
its card to the screen.

## 6. Database changes

- Tables live in `packages/db/src/schema/`, one file per table, exported from the index.
- After changing a table, generate a migration and **commit it**:
  `pnpm --filter @jogylink/db db:generate`
- **Never edit a migration that is already on `main`.** Add a new one.
- The table called `user` is a reserved word in PostgreSQL. Drizzle quotes it for you, but hand-written
  SQL must write `"user"`.
- Tests run every migration against a real PostgreSQL engine in memory, so a broken migration fails
  `pnpm test` for everyone. Run it before you push.

## 7. Writing a test

```ts
import { bearer, createTestApp, type TestApp } from './helpers/test-app';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());

it('lets the owner in and keeps a worker out', async () => {
  const owner = await t.ownerToken();
  const worker = await t.workerToken();
  expect((await t.http.get('/api/stock').set(bearer(owner))).status).toBe(200);
  expect((await t.http.get('/api/stock').set(bearer(worker))).status).toBe(403);
});
```

Every call to `createTestApp()` gives you a fresh, seeded database (an owner, a worker, settings and
30 sample products). Good tests also try to break the rule: a wrong role, a missing login, bad input.

Run everything: `pnpm test`. If the database tests fail with a timeout on a busy laptop, close
Docker and the dev servers and run again.

## 8. Building a web screen

- Admin pages go in `apps/web/app/(admin)/<page>/page.tsx`. The layout already requires a signed-in
  owner and shows the navigation; add your link in `app/(admin)/admin-nav.tsx`.
- The public shop (M8) goes in a separate `(shop)` route group with **no** login.
- **Read data** in a server component with `apiGet('/path', parse)` (`lib/server-api.ts`).
- **Change data** from a client component with `callApi('POST', '/path', body)` (`lib/client-api.ts`).
  It goes through the web app's own `/backend/...` route, which adds the login for you.
- **Never touch the token.** It lives in an httpOnly cookie that page code cannot read, by design.
  Do not store a token in `localStorage`.
- Use the shared components from `@jogylink/ui` and open `/dev/components` to see them:
  - `Button`: a disabled button must say why (`disabledReason`). Only one primary per screen.
  - `FormField`: label above, errors say how to fix it.
  - `ConfirmDialog`: a destructive action must name the item ("Delete Kalu Dodol 250g?").
- Colour is never the only signal. Pair it with an icon and a word (see how status is shown on the
  Products and Users screens).
- Look at the Products screen (`app/(admin)/products`) as a worked example of a list, a form dialog and
  a confirmation.

## 9. Running it on your machine

Needs Node 22, pnpm 10 and Docker Desktop.

```
copy .env.example .env           (then fill in the values below)
docker compose up -d
pnpm install
pnpm --filter @jogylink/shared build
pnpm --filter @jogylink/db exec tsx --env-file=../../.env src/migrate.ts
pnpm --filter @jogylink/db exec tsx --env-file=../../.env src/seed-cli.ts
pnpm --filter @jogylink/api dev        (one terminal)
pnpm --filter @jogylink/web dev        (another terminal)
```

In `.env` set: `POSTGRES_PASSWORD` (and the same password inside `DATABASE_URL`), `JWT_SECRET` (32+
characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), and
`SEED_OWNER_PASSWORD` / `SEED_WORKER_PASSWORD` (must **not** be blank).

Sign in at `http://localhost:3000` as `owner` or `worker` with the seed passwords.

## 10. Gotchas that cost people an afternoon

- **After you change `packages/shared`, rebuild it:** `pnpm --filter @jogylink/shared build`. The API
  reads the built copy, so it will not see your change until you do.
- **Do not commit `.next/` folders, `node_modules/`, or `.env`.** Check `git status` before
  `git add -A`.
- The database scripts (`db:migrate`, `db:seed`) do not read `.env` by themselves. Use the
  `--env-file` commands in section 9.
- The API is NestJS 11 with CommonJS. Do not upgrade Nest or switch the project to ES modules.
- Windows: "LF will be replaced by CRLF" warnings are harmless.

## 11. What belongs to M1, and what does not

M1 owns: login and roles, users, products and prices, settings, the shared components, and the
admin frame. If you need a change in one of those (a new setting, a new product field, a missing
button state), open a small PR or message Nethmini rather than working around it in your module.
Your own tables, services and screens are yours.
