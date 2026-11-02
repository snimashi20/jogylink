# Architecture

Three-layer Digital Business Architecture (Lecture 2.1): front end, information management, back end, plus a cross-cutting communication hub.

**Stakeholders:** A1 sweet producers · A2 retail shops · A3 supermarket outlets · A4 individual consumers · A5 owner & worker

## Layer 1 — Front end

| Module | What it does | Solves |
|---|---|---|
| F1 Retailer ordering app | Catalogue with photos and prices, reorder from last order, live credit balance and due dates, returns request, new-product samples. A lightweight web app *and* a WhatsApp ordering flow. | P2 P5 P10 P12 |
| F2 Producer portal | Rolling demand forecast per producer line, purchase orders, quality scores and shelf-life performance by batch. | P6 P7 P9 |
| F3 Consumer storefront | Direct-to-consumer festival packs, gift boxes and bulk orders with delivery. Small revenue at first; reveals true end-demand. | P11 P12 |
| F4 Field sales & delivery app | Mobile, offline-capable: scan batch, record delivery, take payment, log shop shelf stock, photograph damaged goods. The most important module for a two-person business. | P2 P4 P5 P9 |

## Layer 2 — Information management

| Module | What it does | Solves |
|---|---|---|
| I1 Batch & expiry intelligence | Stock tracked per batch with a First-Expired-First-Out picking rule, across store, van and each shop's shelf. Amber alert at 30 days to expiry, red at 10, with a suggested discount or redistribution. | P2 P8 P11 |
| I2 Dynamic pricing & true-margin engine | Landed cost per batch (purchase price + transport + allocated wastage); flags any product below the owner's margin floor and suggests (never imposes) a new price. | P3 P4 |
| I3 Credit & receivables control | Ledger per shop: taken, paid, outstanding, due. Credit limits, ageing buckets, automatic polite reminders, and a credit block past an owner-controlled threshold. | P1 P5 |
| I4 Demand forecasting & seasonal planner | Forecast per product per shop from sales history, weighted by a festival calendar (Sinhala and Tamil New Year, Vesak, Ramadan, Christmas). | P1 P6 P11 |
| I5 Quality & returns traceability | Photo and grade the batch at goods receipt, time-stamped against producer and batch number, so return claims have evidence. Plans consolidated return trips. | P7 P9 |
| I6 CRM & organizational memory | Profile per shop: what they buy and refuse, order rhythm, payment behaviour, decision-maker, competitor products. | P10 P12 |

## Layer 3 — Back end

| Module | What it does | Solves |
|---|---|---|
| B1 Central database | One source of truth for products, batches, shops, producers, orders, payments and movements. | All |
| B2 e-Procurement | Purchase orders raised from the forecast, sent digitally, with receipt confirmation and a goods-received check. | P1 P6 P7 |
| B3 Route & delivery optimisation | Day's route built from which shops are due stock or payment; groups return trips. | P9 P12 |
| B4 Digital payments | LankaQR and online bank transfer at delivery, settled into the ledger. | P1 P5 |
| B5 Analytics dashboard | True profit by product, shop and trip; dead-stock list; leakage report; forecast accuracy. | P4 P11 |

## Cross-cutting — Communication hub

WhatsApp Business API, SMS and in-app alerts across all three layers: order confirmations, payment reminders, expiry warnings, new-product announcements.
