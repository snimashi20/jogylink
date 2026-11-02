# JogyLink

From sweet trader to demand network — a digital platform for **Jogy Products**, a two-person sweets distribution business (one owner, one worker) that buys from small producers and sells on credit to retail shops.

Course project: IN22-S5-IS3200 · Go-Digital.

## The idea

Jogy believes it buys and sells sweets. It actually **carries risk and routes demand** between producers who cannot reach shops and shops that cannot source from many producers. The sweets are the vehicle; the information (who buys what, where, when, at what price and freshness) is the asset, and today it lives only in the owner's head.

JogyLink records that information and uses it to stop the money leaking out (expiry, dead stock, tied-up credit, unrecovered returns, wasted trips, margin erosion, stockouts).

## Architecture

Three layers, per the Digital Business Architecture (Lecture 2.1). Full detail in [docs/architecture.md](docs/architecture.md).

| Layer | Modules | Folder |
|---|---|---|
| Front end | F1 retailer app, F2 producer portal, F3 consumer storefront, F4 field app | [frontend/](frontend/) |
| Information management | I1 batch & expiry, I2 pricing & margin, I3 credit, I4 forecasting, I5 quality & returns, I6 CRM | [backend/](backend/) |
| Back end | B1 database, B2 procurement, B3 routing, B4 payments, B5 analytics | [database/](database/), [backend/](backend/) |
| Cross-cutting | Communication hub (WhatsApp Business API, SMS, in-app alerts) | [comms/](comms/) |

## Repository layout

```
frontend/    PWAs: f1-retailer-app, f2-producer-portal, f3-consumer-storefront, f4-field-app
backend/     one folder per information / back-end module (i1…i6, b2…b5)
database/    B1 central PostgreSQL database and migrations
comms/       communication hub (WhatsApp, SMS, in-app)
docs/        blueprint, architecture, problem map, rollout, technology choices
```

## Rollout

| Wave | When | Modules |
|---|---|---|
| 1 — Stop the bleeding | 0–3 months | F4, I1, I3, B1 |
| 2 — Connect the shops | 3–6 months | F1, I2, I6, B4, B5 |
| 3 — Connect producers and consumers | 6–12 months | F2, F3, I4, I5, B2, B3 |

See [docs/rollout.md](docs/rollout.md).

## Technology (summary)

PWA front ends (offline-first field app), WhatsApp Business API as a parallel ordering channel, PostgreSQL as the single source of truth, QR batch labels, LankaQR payments, forecasting by moving average with a seasonal index. AI forecasting, blockchain traceability and a native mobile app were considered and rejected as disproportionate at this scale. See [docs/technology.md](docs/technology.md).

## Getting started

```bash
cp .env.example .env
docker compose up -d      # PostgreSQL for local development
```

## Docs

- [Blueprint](docs/blueprint.md) — the core-business reframe, informational representation, leakage, strategy
- [Architecture](docs/architecture.md) — layers and component catalogue
- [Problem map](docs/problem-map.md) — the 12 reported problems → modules → lecture frameworks
- [Stakeholders](docs/stakeholders.md) — win-win for every party
- [Rollout](docs/rollout.md) — three waves and the adoption barrier
- [Technology](docs/technology.md) — choice per layer and what was rejected
