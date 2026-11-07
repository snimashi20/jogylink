# JogyLink

A digital platform for **Jogy Products**, a two-person sweets distribution business (one owner,
one worker) that buys from small producers and sells on credit to about 300 retail shops.

Course project: IN23-S5-IS3200 · Go-Digital · Group 4 — Opero.

## The idea

Jogy believes it buys and sells sweets. It actually **carries risk and routes demand** between
producers who cannot reach shops and shops that cannot source from many producers. The sweets are
the vehicle; the information — who buys what, where, when, at what price and freshness — is the
asset, and today it lives only in the owner's head.

JogyLink records that information and uses it to stop the money leaking out: expiry, dead stock,
tied-up credit, unrecovered returns, wasted trips, margin erosion, stockouts.

## One system, three windows, one database

```
                    +--------------------------------+
                    |      ONE SHARED DATABASE       |
                    +--------------------------------+
                      /            |             \
        +-------------+   +----------------+   +----------------+
        | MOBILE POS  |   |  ADMIN SYSTEM  |   | PUBLIC WEBSITE |
        | (in the van)|   |  (the owner)   |   | (individuals)  |
        +-------------+   +----------------+   +----------------+
```

If these three did not share one database, we would rebuild the present problem in digital form:
three sets of records that disagree with each other.

## Who uses what

| Group | Uses | Receives |
|---|---|---|
| **Retail shops** (~300, main revenue) | Nothing digital | A **printed receipt signed by pen** which they keep, plus an **SMS** with the outstanding balance. Charged the **wholesale** price |
| **Individual customers** | Public website | Order and pay by COD or card, track the order. Charged the **retail** price (110%) |
| **Suppliers** | Nothing digital | A **phone call from the owner**, prompted by a system alert |
| **Owner** | Admin web system | Dashboard, inventory, reports, alerts |
| **Worker** | Mobile POS device | Route list, billing, returns capture, payments |

Shops and suppliers are deliberately given paper, SMS and phone calls rather than an app.
Lecture 3: do not assume everyone wants digital. Lecture 2.2 lists the digital divide as a real
barrier. This is the design responding to the actual customer.

## Two price levels

**Wholesale** for shops, **retail at 110%** for the website, derived automatically from one
setting. Selling online at the shop price would mean Jogy undercutting the 300 shops that are its
main revenue — *partial, non-competing disintermediation* (Lecture 2.2).

## Repository layout

```
apps/
  api/        NestJS backend — one module per team member
  pos/        React Native + Expo, offline-first POS for the van
  web/        Next.js — (admin) and (shop) route groups
packages/
  shared/     Zod schemas = the frozen API contract
  db/         Drizzle schema, used for both Postgres and device SQLite
  ui/         The 24 shared components and design tokens
database/     Migrations
docs/         Blueprint, architecture, problem map, rollout, technology, sync, work division
```

## Build order

| Stage | Months | Theme |
|---|---|---|
| 1 | 1–2 | **Capture the data** — POS, batches, stock, credit, receipts |
| 2 | 3–4 | **Use the data** — expiry alerts, FEFO, reordering, return claims |
| 3 | 5–6 | **Open new revenue** — public website, PayHere, COD, courier |

Root causes RC1 (no stock record) and RC2 (no financial record) cause 6 of the 12 problems, so
nothing else can work until that data exists. See [docs/rollout.md](docs/rollout.md).

## Getting started

Requires Node 22 and pnpm 10 (`corepack enable` picks the right pnpm automatically).

```bash
cp .env.example .env
docker compose up -d                          # PostgreSQL for local development
pnpm install
pnpm --filter @jogylink/shared build          # the shared contract other packages import
pnpm --filter @jogylink/db db:migrate         # create the tables
pnpm --filter @jogylink/db db:seed            # owner + worker users, settings, 30 sample products
pnpm test                                     # unit tests (database tests run in-process, no Docker)
```

Before opening a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md): branch from `develop`, PR into `develop`, never push to `main`.

## How we work

Branch from `develop`, open a pull request back into `develop`, get your review partner to
approve, then merge. **Never push to `main`.**

```bash
git checkout develop
git pull
git checkout -b yourname/m6-offline-sync
```

Full rules and the review-partner ring: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Docs

- [Blueprint](docs/blueprint.md) — the core-business reframe, informational representation, leakage
- [Architecture](docs/architecture.md) — layers, who-uses-what, the eight modules, expiry, stock locations
- [Work division](docs/work-division.md) — what each of the eight members owns
- [Problem map](docs/problem-map.md) — the 12 problems → modules → how completely each is solved
- [Sync design](docs/sync.md) — the offline outbox pattern (M6)
- [Rollout](docs/rollout.md) — three stages and the adoption barriers
- [Stakeholders](docs/stakeholders.md) — win-win for every party
- [Technology](docs/technology.md) — choice per layer and what was rejected
