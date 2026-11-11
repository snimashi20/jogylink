# Hosting JogyLink

Three free-to-start services, one job each:

| Part | Service | What it runs |
|---|---|---|
| Database | **Neon** | Postgres |
| API | **Railway** | `apps/api` (NestJS) |
| Admin website | **Vercel** | `apps/web` (Next.js) |

The POS phone app is not hosted: it is installed on the phones and talks to the API.

Check each service's current free allowance and prices before relying on it. Free plans change,
and some pause or sleep when idle (a sleeping API makes the first request slow).

The order matters: **database first, then API, then website.** Do these steps once.

## 0. Make two secrets (on your computer)

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run it once. Save the output as `JWT_SECRET`. Never commit it, never paste it in chat or a PR.
Also choose strong passwords for the first owner and worker accounts (`SEED_OWNER_PASSWORD`,
`SEED_WORKER_PASSWORD`). Keep all of these in a password manager.

## 1. Database (Neon)

1. Create an account at neon.com and a new project (name `jogylink`). Pick the region closest to Sri Lanka
   that is offered.
2. Copy the **connection string** (it looks like `postgresql://user:pass@host/db?sslmode=require`).
   This is your production `DATABASE_URL`. Treat it as a password.

### Create the tables and the first accounts

Run these on your own computer, once, pointing at Neon. In Command Prompt (Windows):

```
cd C:\JogySweets\jogylink
set DATABASE_URL=postgresql://...your Neon string...
set NODE_ENV=production
set SEED_OWNER_PASSWORD=...your owner password...
set SEED_WORKER_PASSWORD=...your worker password...
pnpm --filter @jogylink/shared build
pnpm --filter @jogylink/db exec tsx src/migrate.ts
pnpm --filter @jogylink/db exec tsx src/seed-cli.ts
```

(`set` only lasts for that Command Prompt window, so nothing is saved to disk.)
Whenever the schema changes later (a new file in `packages/db/drizzle`), run the migrate line
again against Neon **before** deploying the API that needs it.

## 2. API (Railway)

1. Create an account at railway.com, then **New Project → Deploy from GitHub repo** → `jogylink`.
2. In the service **Settings**:
   - **Build command:** `pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=@jogylink/api`
   - **Start command:** `pnpm --filter @jogylink/api start`
   - **Health check path:** `/api/health`
3. In **Variables**, add:

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Neon string |
   | `JWT_SECRET` | the secret from step 0 |
   | `CORS_ORIGIN` | the Vercel website address (step 3); for now `https://example.com`, fix it after |
   | `RETAIL_MARKUP` | `1.10` (or the owner's number) |

   Railway sets `PORT` itself. Do not set it.
4. **Settings → Networking → Generate domain.** Test it in a browser:
   `https://<your-api-domain>/api/health` should answer. Note this address.

Only the POS app reads `CORS_ORIGIN` (browsers on the website never call the API directly: the
website's server does). It can stay narrow.

## 3. Admin website (Vercel)

1. Create an account at vercel.com, **Add New → Project**, import `jogylink`.
2. Settings on the import screen:
   - **Root Directory:** `apps/web`
   - Turn **on** "Include source files outside of the Root Directory".
   - **Install command:** `pnpm install --frozen-lockfile`
   - **Build command:** `cd ../.. && pnpm exec turbo run build --filter=@jogylink/web`
   - **Output directory:** leave as the Next.js default.
3. **Environment Variables:** `API_URL` = `https://<your-api-domain>/api` (note the `/api`).
4. Deploy. Open the website address, sign in as the owner.
5. Go back to Railway and set `CORS_ORIGIN` to this website address, then redeploy the API.

## 4. Point the POS app at the API

Build the phone app with the production API address:

```
set EXPO_PUBLIC_API_URL=https://<your-api-domain>/api
```
(See `apps/pos/README.md`.)

## 5. Check it works (before telling anyone)

- [ ] `https://<api>/api/health` answers
- [ ] The website loads and the owner can sign in
- [ ] A worker account is told "This area is for the owner" on the website
- [ ] Products page shows both wholesale and retail prices
- [ ] Wrong password five times locks sign-in (then wait, or ask a teammate to confirm the message)
- [ ] The default passwords from development do **not** work

## 6. Day-to-day

- **Deploys:** Vercel and Railway redeploy when `main` changes. Only merge to `main` once a PR is approved.
- **Secrets:** never put them in the repo. If one leaks, replace it (new `JWT_SECRET` signs everyone out, which is fine).
- **Backups:** check Neon's backup / restore window for your plan, and write it in the report.
- **Owner password lost:** run the seed again with a new `SEED_OWNER_PASSWORD`, or ask M1.

## For the report (Phase 6, hosting)

Say what each service does, why it was chosen (free to start, no server to maintain, deploys from
GitHub), where secrets are kept (service variables, not the repo), and the risks: free-plan limits,
cold starts, one region.
