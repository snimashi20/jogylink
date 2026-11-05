# apps/web — Admin system + public website (Next.js 15)

One Next.js app, two route groups.

```
app/
├── (admin)/    Owner's system — A1 … A15, login required
└── (shop)/     Public website — W1 … W12, no login
```

## Admin pages (A1–A15)

| Page | Owner | Page | Owner |
|---|---|---|---|
| A1 Dashboard frame | M1 | A9 Credit Ledger | M6 |
| A2 Products | M1 | A10 Returns + Claims | M7 |
| A3 Goods Received | M2 | A11 Purchase Orders | M3 |
| A4 Inventory / Stock | M3 | A12 Reports frame | M1 |
| A5 Suppliers | M2 | A13 Route & Loading | M4 |
| A6 Shops | M4 | A14 Users | M1 |
| A7 Sales / Receipts | M6 | A15 Settings | M1 |
| A8 Website Orders | M8 | | |

Each member contributes their own dashboard widget and report query — see
[docs/work-division.md](../../docs/work-division.md).

## Public website (W1–W12)

| Page | Owner | Page | Owner |
|---|---|---|---|
| W1 Home | M8 | W7 Track My Order | M8 |
| W2 Catalogue | M8 | W8 My Account | M8 |
| W3 Product | M8 | W9 Festival & Gift Packs | M2 |
| W4 Cart | M8 | W10 Our Story / Producers | M2 |
| W5 Checkout | M8 | W11 Contact | M2 |
| W6 Confirmation | M8 | W12 Trade Enquiry | M2 |

## Rules

- The website shows the **retail price** (wholesale × 1.10), never the wholesale price.
- The catalogue sells only from **Green** expiry batches.
- W12 collects trade enquiries but **never publishes wholesale prices** — that would undercut
  the 300 shops.
- Server rendering is used for the public pages because search visibility matters (Lecture 5.4).
