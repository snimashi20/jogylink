# Architecture

Three-layer Digital Business Architecture (Lecture 2.1), delivered as **one system with three
windows** over **one shared database**.

```
                    +--------------------------------+
                    |      ONE SHARED DATABASE       |
                    +--------------------------------+
                      /            |             \
        +-------------+   +----------------+   +----------------+
        | MOBILE POS  |   |  ADMIN SYSTEM  |   | PUBLIC WEBSITE |
        | (in the van)|   |  (the owner)   |   | (individuals)  |
        +-------------+   +----------------+   +----------------+
               |                   |                    |
        Retail shops get     Owner manages        Online customers
        a printed signed     stock, orders,       order and pay
        receipt + SMS        suppliers, reports   (COD or card)
                                     |
                             Alert to owner, then
                             phone call to supplier
```

| Layer | What sits here |
|---|---|
| **Front end** | Public website, the POS screen the shop sees, the SMS messages |
| **Information management** | The shared database, reports, alerts, forecasts |
| **Back end** | Admin system: inventory, suppliers, purchasing, accounts |

## Who uses what

This is the most important decision in the project.

| Group | Uses | Receives | Why |
|---|---|---|---|
| **Retail shops** (~300, main revenue) | Nothing digital | One **printed receipt signed by pen** which they keep, plus an **SMS** with the outstanding balance. Charged the **wholesale** price | Shop owners are busy and many will not use an app. Forcing them to would mean the system is simply not used |
| **Individual customers** | Public website | Browse, order, pay by COD or card, track the order. Charged the **retail** price (110%) | This group is online already and cannot currently find or buy from the business at all |
| **Suppliers / producers** | Nothing digital | A **phone call from the owner**, prompted by a system alert | Many producers are older and rural. A phone call is how business is actually done |
| **Owner** | Admin web system | Dashboard, full inventory control, CRUD, reports, alerts | The person who needs to see the whole business |
| **Worker** | Mobile POS device | Route list, billing, returns capture, payment recording | Data must be captured where the sale happens |

Lecture 3 states that some customers transact online, some prefer offline, and many do both — so
do not assume everyone wants digital. Lecture 2.2 lists the digital divide as a real barrier and
advises keeping offline options. Giving shops paper and SMS is the design responding to the
actual customer, not a weakness.

## Two price levels

Shops and individuals cannot pay the same price.

- **Wholesale price** — the stored base price, charged on the POS to retail shops.
- **Retail price** — `wholesale × 1.10`, derived automatically, charged on the website.

The markup lives once in system settings so the two prices can never drift apart.
`SaleLine.price_type` records which price was charged, so profit is reportable per channel.

This is **partial, non-competing disintermediation** (Lecture 2.2): Jogy *is* the middleman, so
selling online at the shop price would mean undercutting the 300 shops that are its main revenue.

## The eight build modules

One member owns each module end to end: database table → backend service → user screen.

| Module | Owns | Solves |
|---|---|---|
| **M1** Foundation, Auth & Pricing | Login, users, products, the two-price engine, settings | P3 |
| **M2** Suppliers & Goods Received | Supplier records, batches, purchase prices, expiry dates | P7 |
| **M3** Expiry Engine & Reordering | Four-stage expiry, FEFO, reorder levels, supplier alerts | P6 P8 P11 |
| **M4** Stock, Shops & Routes | Five stock locations, 300 shops, routes, van loading, reconciliation | P2 |
| **M5** POS Billing & Receipt | Sale transaction, receipt printing, signature capture | P5 P4 |
| **M6** Offline Sync, Credit & Payments | Offline-first sync, credit ledger, PayHere | P1 P5 |
| **M7** Returns & Claims | Photo evidence, partial returns, supplier claims | P9 P7 |
| **M8** Website, SMS & Delivery | Public shop, SMS, COD, courier tracking, online orders | P10 P12 |

See [work-division.md](work-division.md) for the full breakdown.

## Expiry: four stages

| Stage | When | What the system does |
|---|---|---|
| **Green** (Safe) | More than 46 days left | Normal selling |
| **Yellow** (Watch) | 45 to 22 days | Marked *sell first* on the van loading list |
| **Orange** (Act now) | 21 to 8 days | Alert raised; suggest a discount or a return |
| **Red** (Expired) | Expired, or under 7 days | **Blocked from sale** — cannot be loaded or sold online |

**FEFO** — the POS always picks the earliest-expiring batch automatically. The website sells only
from **Green** batches, because a customer paying a premium should not receive short-dated stock.

## Five stock locations

| Location | Sellable? | Meaning |
|---|---|---|
| `STORE` | Yes | Good stock at the store |
| `VAN` | Yes | Good stock loaded for selling |
| `VAN-QUARANTINE` | **No** | Returns collected today, in the van's sealed crate |
| `QUARANTINE` | **No** | Returns on the quarantine shelf awaiting a claim |
| `DISPOSED` | **No** | Written off; kept so the loss stays visible in reports |

Because quarantine is a *location* and not a flag, expired food is excluded from the loading
list, the POS and the website **by construction**, not by remembering to filter it out.
