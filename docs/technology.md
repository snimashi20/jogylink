# Technology per layer

Each choice is justified against the business's actual scale (one owner, one worker) and against
the team decision that **retail shops and suppliers use no digital channel at all**.

## Stack

| Part | Technology | Why this, at this scale |
|---|---|---|
| Language (everywhere) | **TypeScript** | One language across POS, admin, website and API. Shared types mean a broken API contract is a compile error, not a week-10 integration surprise |
| Monorepo | **pnpm workspaces + Turborepo** | Eight members, one repo. `packages/shared` holds the frozen API contract |
| Backend | **NestJS** | Its module system maps 1:1 onto the eight member modules; dependency injection makes each module testable alone |
| Database | **PostgreSQL 16** | Batch → Product → Supplier needs real foreign keys; credit and sync need real transactions |
| ORM | **Drizzle** | Runs on Postgres server-side *and* SQLite inside the POS app, so offline and online schemas stay in step |
| POS (van) | **React Native + Expo dev build** | Needs native modules for the thermal printer and camera, so Expo Go is not enough |
| POS local store | **expo-sqlite + Drizzle** | The offline source of truth on the device |
| POS sync | Custom **outbox pattern** + expo-task-manager + NetInfo | Written by hand, not with a sync library — see `docs/sync.md` |
| Admin + public website | **Next.js 15 (App Router)** | One app, two route groups: `(admin)` and `(shop)`. Server rendering matters for the SEO work in Lecture 5.4 |
| UI | **Tailwind CSS + shadcn/ui** | The 24 shared components map onto shadcn primitives |
| Card payments | **PayHere** | Sri Lankan gateway, local cards. Server-side `md5sig` verification on every callback |
| Cash payments | **Cash on Delivery** via courier | Removes the trust barrier for first-time online buyers (Lecture 2.2) |
| Messaging | **SMS gateway** (Text.lk / Notify.lk / Send.lk) | Reaches every basic phone with no app, no data and no training. Supports Sinhala |
| Photo storage | **Cloudinary** (free tier) | Return-evidence photos with an uneditable timestamp |
| Delivery | **Third-party courier** with tracking | National reach without a second vehicle |
| Hosting | Neon (DB) · Railway (API) · Vercel (web) | All free or near-free tiers — limited working capital is problem P1 |
| Testing | **Vitest + Testcontainers** | Sync correctness is tested against a real Postgres in a container |

## Considered and rejected

| Rejected | Why |
|---|---|
| **Retailer ordering app / PWA for shops** | Shop owners are busy and many will not install or log into anything. They receive a printed signed receipt and an SMS instead. Lecture 3: do not assume everyone wants digital |
| **Producer portal** | Many producers are older and rural. The system alerts the *owner*, who telephones them |
| **WhatsApp Business API** | Needs a verified business account and a data connection at both ends. Plain SMS reaches every phone |
| **PWA for the van** | Cannot reliably drive a Bluetooth thermal printer or guarantee offline storage. A native Android POS device can |
| **LankaQR only** | The online channel needs card payment for gift and diaspora buyers; PayHere covers both |
| Sync libraries (WatermelonDB, PowerSync) | The outbox pattern is ~300 lines and is the core engineering content of module M6 |
| AI forecasting, blockchain traceability | Disproportionate to a business with one owner and one worker |
