# apps/api — NestJS backend

One NestJS module per team member. Each owner works only inside their own folder.

| Folder | Owner | Contains |
|---|---|---|
| `auth/`, `products/`, `settings/` | **M1** | Auth, roles, the two-price engine, system settings |
| `suppliers/`, `batches/` | **M2** | Goods received, supplier records, quality ratings |
| `expiry/`, `reordering/` | **M3** | Expiry classifier, FEFO picker, reorder calculator, alerts |
| `stock/`, `shops/`, `routes/` | **M4** | Five stock locations, shops, routes, van loading |
| `sales/` | **M5** | Sale transaction, price-type handling, receipt generation |
| `sync/`, `credit/`, `payments/` | **M6** | Sync endpoint, credit ledger, PayHere |
| `returns/`, `claims/` | **M7** | Return capture, partial returns, supplier claims |
| `weborders/`, `sms/`, `delivery/` | **M8** | Website orders, SMS gateway, COD, courier |

Shared request and response types live in `packages/shared` and are frozen after week 1.
