# Credit ledger design (M6)

Jogy sells on credit to about 300 shops. The money tied up in that credit, and the part of it that
quietly never comes back, is one of the leaks this project exists to stop — so the ledger is the
heart of M6 rather than a report bolted onto sales.

## The ledger is a list of movements, not a balance

`credit_entry` is append-only. Every row is one signed movement against one shop:

| Kind | Direction | Where it comes from |
|---|---|---|
| `sale` | increases the debt | a sale uploaded from the van |
| `return` | reduces it | goods the shop sent back (M7's figures) |
| `payment` | reduces it | cash in the van, or collected by the owner |
| `adjustment` | either way | the owner correcting something |

A shop's balance is the **sum of its movements**, derived on read. No column anywhere stores it.

This is the same decision as [sync.md](sync.md), for the same reason: the van is offline for
hours, so if both the device and the server held a "current balance" they would disagree, and
there would be no way to tell which was right. Neither owns the number — the movements do, and
each one is a fact that already happened.

Rows are never updated or deleted. A mistake is corrected by posting an `adjustment`, so the
history of how a figure was reached survives for the owner to look at.

## Posting is idempotent, enforced by the database

Every entry carries `source_uuid` — the id of the event it came from, generated on the device
before the sale was saved. That column is `UNIQUE`, and inserts use `ON CONFLICT DO NOTHING`.

A POS that uploads the same morning twice, a retried admin request, a sync interrupted and
resumed: none of them can double a shop's debt. Posting an event that is already there returns
`null` rather than throwing, because a retry is a normal outcome and the ledger is correct either
way.

This is the property the whole offline design rests on, so it is a constraint rather than a
remembered check in application code.

## What the database refuses

The invariants are in the schema, not only in the service, because a sign error is money moving
the wrong way with nothing on screen looking obviously wrong:

- a `sale` must be positive; a `return` or `payment` must be negative;
- no movement of zero;
- a due date only on a `sale`;
- one entry per `source_uuid`.

## The receipt calculation

Exactly as the owner states it, in one tested place (`packages/shared/src/credit.ts`) so the
printed receipt, the POS screen, the ledger and the dashboard cannot disagree:

```
net bill    = goods purchased − return value
total due   = previous outstanding balance + net bill
outstanding = total due − amount paid
```

All of it in **integer cents**. Money on the wire stays a rupee number with two decimals, as
elsewhere in the API, and is converted at the service boundary. A balance that drifts a cent per
sale across 300 shops is money the owner cannot account for.

A return may exceed the purchase and a balance may go negative: that shop is in credit, which is
allowed and carries into the next visit.

## Ageing applies payments to the oldest debt first

`ageOutstanding` sorts a shop's credit sales by due date, consumes its payments and return credits
against the **oldest** first, then buckets whatever is left by how overdue it is: not yet due,
1–30, 31–60, 61–90, over 90 days.

FIFO matters here. A shop that pays something on every visit should never show a 90-day debt while
its recent bills look settled — the owner's decision to chase a shop or keep supplying it rests on
this number, so the allocation is explicit rather than implied by a date filter.

Days are counted on calendar days in UTC, so a sale at 9am and one at 5pm are the same age and a
clock change cannot move a debt into another bucket. A shop in credit is not aged at all.

The report is calculated in TypeScript over the ledger, because FIFO allocation is awkward in SQL
and this figure drives real decisions. At ~300 shops that is a small query; if the ledger grows to
years of history, this is the thing to move into SQL.

## Endpoints

Owner only. The worker bills; the owner manages credit.

| Endpoint | Screen |
|---|---|
| `GET /credit/summary` | A1 — total outstanding credit, overdue accounts |
| `GET /credit/ageing` | A12 — the ageing report, per shop and in total |
| `GET /credit/shops/:shopId` | A9 — one shop's statement, running balance, buckets, over-limit flag |
| `POST /credit/payments` | A9 — record a payment, idempotent on `sourceUuid` |

There is deliberately **no endpoint to edit or delete an entry**.

Sales, returns and payments taken in the van do not come through these endpoints. They arrive as
events on `POST /sync` and are posted by `CreditService` in the same transaction as the sale, so
there is one path for money from the van and one for the owner's own corrections.

## Settings

`credit_term_days` (default **30**) sets when a credit sale falls due, and therefore what counts as
overdue. It is a **placeholder**: the owner should confirm the real trade term. Changing it affects
sales made from then on; it never rewrites the due date of a sale already agreed.

The ageing boundaries are the conventional ones and should also be confirmed before the ledger
screen is used in anger.

## What the OneShop reference offered: nothing

A search of the whole OneShopPOS repository for `outstanding`, `credit limit`, `overdue`,
`due date` and `ageing` returns two unrelated UI files. OneShop sells to walk-in customers who pay
immediately: its `Customer` model is a **loyalty** record — `totalSpent`, `loyaltyPoints`,
`lastPurchase`. There is no receivable, no due date, no ageing, no concept of a customer owing
money over time.

`totalSpent` is also exactly the shape of thing this design avoids: a stored running total that
can drift from the events behind it.

So the ledger is built from the owner's stated arithmetic and the event-sourcing decision in
[sync.md](sync.md), not adapted from the reference. Recorded here so the decision is traceable.

## Still to come

The A9 and A7 screens, the A1 widgets and the A12 report front-ends (phases 6 and 7); PayHere
(phase 5); credit reminder SMS, which goes through **M8's** SMS service and not a separate
gateway. `CreditService.recordSale` / `recordReturn` / `recordPayment` are ready for the `/sync`
handler, which is waiting on M5's server-side sale tables.
