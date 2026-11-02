# Technology per layer

Each choice is justified against the business's actual scale (one owner, one worker).

| Part | Technology | Why this, at this scale |
|---|---|---|
| Retailer & consumer front end | Progressive Web App; WhatsApp Business API as the parallel channel | No app-store install, works on low-end Android, WhatsApp is already on every shop owner's phone |
| Field app | PWA with offline-first local storage and background sync | Coverage on delivery routes is unreliable; must work with no signal and reconcile later |
| Database | PostgreSQL | Batch ledgers and credit balances need transactional integrity |
| Batch identification | QR labels printed on a thermal printer at goods receipt | Cheap, needs no supplier cooperation, a phone camera is the scanner |
| Hosting | Single small cloud instance with automated daily backup | Proportionate cost; no on-premise server |
| Payments | LankaQR and online bank transfer | Already accepted locally; avoids card fees on a thin margin |
| Messaging | WhatsApp Business API plus a local SMS gateway fallback | Reaches shops with no data connection |
| Forecasting | Moving average with a seasonal index, computed in the database | Not enough history for ML, and the owner must be able to understand and overrule the number |
| Analytics | Open-source BI tool reading the same database | No licence cost, no second copy of the data |

## Considered and rejected

AI forecasting, blockchain traceability and a native mobile app: disproportionate to a business with one owner and one worker.
