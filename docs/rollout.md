# Rollout

Three stages. The order is not arbitrary — it follows the TOWS rule from Lecture 3: **an
opportunity that rests on a weakness must be skipped until the strength behind it is built.**

| Stage | When | Theme | Build | Fixes |
|---|---|---|---|---|
| **1** | Months 1–2 | Capture the data | Mobile POS, products with wholesale prices, batches, stock, shops, credit ledger, single-copy receipt printing, signature process, SMS to shops, basic dashboard | P2 P3 P4 P5 P8 |
| **2** | Months 3–4 | Use the data | Full inventory, reorder detection and alerts, call logging, expiry alerts, FEFO, return claims with photos | P6 P7 P9 |
| **3** | Months 5–6 | Open new revenue | Public website with retail pricing, PayHere, COD, courier integration, order tracking, festival pages, heritage content, trade enquiry form, reports with channel split | P1 P10 P11 P12 |

**Why this order.** Root causes RC1 (no stock record) and RC2 (no financial record) cause 6 of
the 12 problems, so nothing else can work until that data exists. Reorder levels and expiry
alerts are meaningless until batches are actually recorded. The website sells from live stock, so
it needs stage 1 data, and it needs a settled wholesale price before a retail price can be
derived from it.

## Adoption barriers (Technology Acceptance Model, Lecture 2.2)

Real use follows from *perceived usefulness* and *perceived ease of use*. Every barrier below
threatens one of those two.

| Barrier | Mitigation |
|---|---|
| The worker reverts to the bill book | The POS must be **faster** than writing by hand: few taps, big buttons, fully offline |
| No mobile signal on rural routes | POS works offline and syncs later; the receipt prints from the device itself |
| Shop owners will not install an app | **They are never asked to.** Paper receipt plus SMS, on any basic phone |
| Producers will not use software | **They are never asked to.** The system alerts the owner, who telephones them |
| The shop loses its only receipt | The SMS carries the same figures; the owner can reprint from the admin system |
| A shop discovers the website price | The website is always the *higher* price, and the receipt states that shop prices are trade prices. Tell the shops before launch |
| Online customers distrust card payment | Cash on Delivery offered alongside PayHere |
| Cost — limited working capital is P1 | One POS device, free-tier hosting, pay-as-you-go SMS, three stages so cost is spread |

## Measuring year one

Lecture 4 separates **lead factors** (what you do) from **lag factors** (sales and profit that
follow) and warns against being deceived by the latter. Judge the first year on:

- Percentage of sales captured on the POS rather than by hand
- Percentage of stock carrying batch and expiry data
- Number of credit balances agreed by both parties (signed receipts)
- Average age of stock at delivery
- Value of return claims successfully recovered
- Number of website orders per month
- Share of total revenue from the retail channel

Revenue will improve, but late. Waiting for it before judging the work would mean reacting about
two quarters after the evidence was already available.
