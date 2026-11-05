# packages/db — Drizzle schema

One schema definition used **twice**: PostgreSQL on the server, SQLite inside the POS app. This
is why Drizzle was chosen — it keeps the offline and online shapes in step automatically.

## The thirteen tables

| Table | Owner | Note |
|---|---|---|
| `user` | M1 | |
| `product` | M1 | Stores `wholesale_price`; retail is derived × 1.10 |
| `setting` | M1 | Holds the retail markup, expiry thresholds, claim triggers |
| `supplier` | M2 | `delivery_method`: doorstep or courier |
| `batch` | M2 | `purchase_price`, `production_date`, **`expiry_date`** |
| `stock` | M4 | `location`: STORE · VAN · VAN-QUARANTINE · QUARANTINE · DISPOSED |
| `shop` | M4 | ~300 rows |
| `route` | M4 | |
| `sale` | M5 | |
| `sale_line` | M5 | **`batch_id`** and `price_type` (wholesale / retail) |
| `credit_entry` | M6 | |
| `return` | M7 | `return_unit`, `qty_returned`, `is_partial`, `photo_url`, `timestamp` |
| `purchase_order` | M3 | `alert_raised`, `call_logged` |
| `web_order` | M8 | `payment_method` (COD / PayHere), `courier_tracking_no` |

## The relationship that makes everything work

```
SaleLine → Batch → Product → Supplier
```

Because a sale line points at a **batch** and not just a product, the system knows the exact
purchase price, expiry date and producer behind every item sold. That one link is what makes
real profit (P4), FEFO (P8) and evidence-backed return claims (P9) possible.

A bill book cannot express this relationship, which is precisely why those three problems exist.
