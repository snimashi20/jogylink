# Work division — eight modules

Each member owns one vertical slice: **database table → backend service → user screen**. Every
table, service, screen, component and setup task has exactly one owner.

Vertical slices rather than horizontal layers, so each member can build, run and demonstrate
their own part end to end, and nobody is frontend-only or backend-only.

## At a glance

| # | Module | Owns | Points |
|---|---|---|---|
| **M1** | Foundation, Auth & Pricing | Login, users, products, the two-price engine, settings | 24 |
| **M2** | Suppliers & Goods Received | Supplier records, batches, purchase prices, expiry dates, content pages | 25 |
| **M3** | Expiry Engine & Reordering | Four-stage expiry, FEFO, reorder levels, supplier call alerts | 24 |
| **M4** | Stock, Shops & Routes | Five stock locations, 300 shops, routes, van loading, reconciliation | 25 |
| **M5** | POS Billing & Receipt | Sale transaction, receipt printing, signature capture | 24 |
| **M6** | Offline Sync, Credit & Payments | Offline-first sync, credit ledger, PayHere | 25 |
| **M7** | Returns & Claims | Photo evidence, partial returns, supplier claims | 24 |
| **M8** | Website, SMS & Delivery | Public shop, all SMS, COD, courier tracking, online orders | 25 |

## Build order

```
        M1 (products, prices, auth)
                |
     +----------+----------+
     |                     |
    M2 (batches)       M4 (stock, shops)
     |                     |
    M3 (expiry, FEFO)  M5 (billing) ----+
                           |            |
                          M6 (sync,    M7 (returns)
                           credit,
                           payments)
                           |
                          M8 (website, SMS, delivery)
```

**M1 and M2 deliver their database tables and seed data in week 2**, before building their own
screens. Everyone else works against that seed data until the real APIs arrive.

## Module detail

### M1 — Foundation, Authentication & Pricing
- **Database:** `User` · `Product` · `Setting`
- **Backend:** auth and sessions · role permissions · **two-price engine** (wholesale stored,
  retail derived as × 1.10, per-product override) · settings service read by every module
- **Frontend:** POS Login · A2 Products (both prices side by side) · A14 Users · A15 Settings
- **Components:** C1 Button · C9 Form Field · C10 Modal
- **Project task:** repository and branching setup
- **Report:** Phase 6 — authentication, hosting, the pricing rule

### M2 — Suppliers, Goods Received & Content
- **Database:** `Supplier` · `Batch`
- **Backend:** goods-received intake (batch, quantity, purchase price, production and expiry
  dates) · supplier CRUD with delivery method and return terms · quality rating and price history
- **Frontend:** A3 Goods Received · A5 Suppliers · Batch detail
- **Website:** W9 Festival & Gift Packs · W10 Our Story · W11 Contact · W12 Trade Enquiry
- **Components:** C2 Status Chip · C16 Search Bar · C17 Filter Chips
- **Project task:** database schema document and ERD
- **Report:** Phase 5 — database design

### M3 — Expiry Engine, FEFO & Reordering
- **Database:** `PurchaseOrder`
- **Backend:** expiry classifier (Green 46+, Yellow 45–22, Orange 21–8, Red under 7) · FEFO
  picker · reorder calculator counting **both** channels · alert engine that stays visible until
  the owner logs an outcome
- **Frontend:** A4 Inventory · A11 Purchase Orders · Expiry alert screen
- **Components:** C7 Metric Card · C8 Alert Panel · C21 Supplier Call Card
- **Project task:** test data generator (30 products, 300 shops, batches at every expiry stage)
- **Report:** Phase 5 — expiry control and demand forecasting

### M4 — Stock, Shops & Routes
- **Database:** `Stock` · `Shop` · `Route`
- **Backend:** stock movement across the five locations · shop and route management with credit
  limits · van loading suggestion from purchase history
- **Frontend:** A6 Shops · A13 Route & Loading · POS Load Van · POS End-of-Route Reconciliation
- **Components:** C6 Data Table · C20 Quantity Stepper · C22 Side Navigation
- **Project task:** integration test plan
- **Report:** Phase 5 — systems integration and stock architecture

### M5 — POS Billing, Receipt & Signature
- **Database:** `Sale` · `SaleLine`
- **Backend:** sale transaction · **price-type handling** (wholesale vs retail per line) ·
  receipt generation and thermal printing with the signature block
- **Frontend:** POS Shop Select · POS Billing · POS Payment · POS Signature Prompt
- **Components:** C3 Money Display · C4 Balance Banner · C5 Product Row
- **Project task:** POS device evaluation
- **Report:** Phase 5 — customer interaction design and the receipt

### M6 — Offline Sync, Credit Ledger & Payments
> **Highest-risk module.** If sync fails, the POS fails. M5 pairs on the sync engine for one week.

- **Database:** `CreditEntry`
- **Backend:** offline-first device storage · **sync engine** (queued bills, conflict handling,
  never lose or duplicate a sale) · credit ledger with ageing and due dates · **PayHere**
  integration with signature verification and reconciliation
- **Frontend:** A9 Credit Ledger · A7 Sales / Receipts with reprint · POS Route List · POS sync
  status
- **Components:** C11 Toast · C13 Offline Banner · C24 Loading Skeleton
- **Project task:** PayHere account research
- **Report:** Phase 6 — offline architecture and payment processing

### M7 — Returns, Partial Returns & Claims
- **Database:** `Return` (incl. `return_unit`, `qty_returned`, `is_partial`, `photo_url`,
  `timestamp`)
- **Backend:** return capture with uneditable photo timestamp · **partial return calculator**
  (pro-rata credit for pieces and loose weight) · claim grouping with value and age triggers ·
  outcome tracking and loss posting
- **Frontend:** POS Add Return · POS Partial Return · A10 Returns · Claim screen
- **Components:** C14 Photo Capture · C15 Signature Reminder · C12 Empty State
- **Project task:** user manual for the worker
- **Report:** Phase 5 — reverse logistics and claims

### M8 — Website, SMS & Delivery
- **Database:** `WebOrder`
- **Backend:** **SMS gateway** (sale confirmations, credit reminders, order updates; queued when
  the POS is offline) · Cash on Delivery flow · courier integration and tracking · order status
  engine
- **Website:** W1–W8 (Home, Catalogue, Product, Cart, Checkout, Confirmation, Track, My Account)
- **Frontend:** A8 Website Orders
- **Components:** C18 Product Card · C19 Order Tracker · C23 Breadcrumb
- **Project task:** SMS gateway and courier research
- **Report:** Phase 5 — web pages, customer trafficking, SEO

## Dashboard and reports

A1 and A12 draw on every module, so each member builds the widget and report query for their own
module. M1 builds the page frames.

| Member | Dashboard widget | Report query |
|---|---|---|
| M1 | Page frame, grid, date-range selector | Report frame and PDF export |
| M2 | Stock value on hand | Purchase cost by supplier |
| M3 | Expiring soon · below reorder level | Wastage · seasonal comparison |
| M4 | Stock split store vs van | Route performance |
| M5 | Today's sales · cash collected | Best/worst sellers · profit per product |
| M6 | Outstanding credit · overdue accounts | Credit ageing |
| M7 | Returns awaiting claim · value in quarantine | Loss from unrecovered claims |
| M8 | New website orders | Profit split by channel |

## Schedule

| Week | What happens |
|---|---|
| 1 | Agree the database tables and API contracts in one session, then freeze them. Everyone builds their 3 UI components |
| 2 | **M1 and M2 deliver tables plus seed data.** M3 delivers the test data generator. M6 delivers the POS repository interface with stubs |
| 3–5 | All eight build their backend services against the seed data |
| 6–8 | All eight build their screens. M5 and M6 pair on the sync engine in week 6 |
| 9 | Everyone builds their dashboard widget and report query. M1 assembles the frames |
| 10 | Integration testing, run by M4 against the test plan |
| 11 | Each member writes their own report section |
| 12 | M2 compiles the final document. Presentation rehearsals |

## Working rules

| Rule | Why |
|---|---|
| You own your module end to end | Database, backend and screen. If it breaks, it is yours to fix |
| Never edit another module's code | Raise it with the owner. Only exception is the agreed M5–M6 pairing |
| API contracts frozen after week 1 | They live in `packages/shared` as Zod schemas, so breaking one is a compile error |
| Use the shared components | Do not build your own button; ask the owner to extend it |
| Seed data is sacred | M3's generator is what everyone tests against |
| Demo your module weekly | Five minutes each, so problems surface early |

**POS boundary.** Four members build POS screens (M4, M5, M6, M7) but only **M6 owns everything
below the UI**. The others call a local repository interface — `saveSale()`, `getRouteShops()`,
`getBalance(shopId)` — and never touch the device database or sync code directly. M6 delivers
that interface with stub implementations in week 2.
