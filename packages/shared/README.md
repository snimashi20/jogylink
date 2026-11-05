# packages/shared — the frozen API contract

Zod schemas and the TypeScript types inferred from them. Imported by `apps/api`, `apps/pos` and
`apps/web`.

**This package is what makes the "contracts are frozen after week 1" rule real.** A schema here
is not a document someone can ignore — if a member changes a field name, every module that uses
it fails to compile immediately, instead of breaking silently during week-10 integration.

```ts
export const SaleSchema = z.object({
  uuid:       z.string().uuid(),      // generated on the device, used for idempotent sync
  receiptNo:  z.string(),
  shopId:     z.string(),
  dateTime:   z.coerce.date(),
  total:      z.number(),
  paidAmount: z.number(),
  paymentType: z.enum(['cash', 'part', 'credit']),
  signatureReceived: z.boolean(),
  servedBy:   z.string(),
});
export type Sale = z.infer<typeof SaleSchema>;
```

## Rules

- **M1 owns this package.** Changes go through a pull request, not a direct push.
- Agreed and frozen in the week 1 session.
- To change a schema after that, tell every module that imports it **before** merging.
