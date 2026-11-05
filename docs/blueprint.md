# Blueprint

## The core business

| Owner's stated business | Actual core business |
|---|---|
| "I buy sweets and sell them to shops." | A risk-absorbing distribution intermediary and demand-sensing network for the sweet industry. |

Jogy exists because it takes five burdens off others:

| Value delivered | Who receives it | What it replaces for them |
|---|---|---|
| Credit provision | Retail shops | Working capital they would otherwise need up front |
| Assortment aggregation | Retail shops, supermarkets | Sourcing relationships with a dozen small producers |
| Risk absorption | Both ends | Expiry loss, quality variance and unsold stock |
| Market access | Producers | A sales force and retail network they cannot afford |
| Demand intelligence | Producers (currently given away free) | Knowing what sells, where, and in which season |

The fifth row is an un-monetised asset and sets up the strategic direction below.

## Informational representation

| Physical reality today | Informational representation | Where it lives now |
|---|---|---|
| A packet of sweets | SKU + batch no. + production date + expiry + landed cost + current margin + producer | Only a price in the owner's memory |
| A delivery to a shop | A sales transaction, a credit event, a stock movement, a demand signal | A handwritten note, if at all |
| A shop visit | CRM touchpoint, replenishment trigger, competitor-intelligence capture | The owner's recollection |
| An expired packet | A forecasting error traceable to a product, shop and season | Written off silently |
| A returned item | A quality claim needing batch, date and condition evidence | Verbal argument with the supplier |
| The owner's judgement | Organizational memory | One human brain |

Frameworks: **information distance** (the lag between an event and the decision-maker knowing; weeks today, target same-day) and **syncing** (producer, Jogy and shop each hold a different picture of the same stock) — Lecture 2.2.

## Where has the money gone?

| Leakage point | Mechanism | Visible to owner? |
|---|---|---|
| Expiry & weather write-offs | Stock passes its date; humidity shortens shelf life | Partly |
| Dead stock | Capital frozen in slow movers that cannot be identified without sales history | No |
| Credit tied up | Cash on shop shelves instead of buying fast movers in season | Partly |
| Unrecovered returns | Returns batched until a trip is worth it; evidence degrades and the supplier refuses | No |
| Unproductive trips | Fuel and a day of the only worker's time on shops that did not need stock | No |
| Margin erosion | Supplier price rises while selling price stays put | No |
| Stockout opportunity cost | Demand exists, stock does not, the shop buys elsewhere | No |

> TODO (fieldwork): quantify each row with the owner as rough monthly rupee figures, labelled as owner-reported estimates.

## Strategic move: re-intermediation

Jogy is a middleman and the internet removes middlemen. The answer is to stop competing as a *physical* intermediary (moving boxes) and compete as an *informational* one: the party that knows what will sell where, guarantees freshness, and absorbs the risk neither producer nor shop wants. That defends against disintermediation and opens a second revenue line — selling demand intelligence back to producers.

```
Producers  →  JogyLink  →  Retail shops  →  Consumers
(phone call   (batch, credit,  (signed receipt +     (website: gift boxes,
 prompted by   price and        SMS balance; fresher  festival packs at
 an alert)     demand record)   stock; no app)        retail price)
```

**Note on channel design.** Shops and producers are served through paper, SMS and phone calls,
not through portals. The information still reaches them — the *channel* simply matches what they
already use. See [architecture.md](architecture.md).

**Note on pricing.** The direct-to-consumer channel sells at **110% of the shop price**. Jogy is
itself the middleman, so selling online at the shop price would disintermediate its own 300
shops. The uplift makes the new channel additive rather than cannibalising.

Frameworks: disintermediation / re-intermediation (Lecture 2.2); the four eBusiness dimensions (Lecture 1) — transactional (online ordering), value-generative (demand intelligence), integration (producers and shops on one record), wider reach (direct-to-consumer).
