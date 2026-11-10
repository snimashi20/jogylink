# @jogylink/ui

Shared React components for the JogyLink web app, built to the UI Design Guide.
The package ships TypeScript source; Next.js compiles it (`transpilePackages`).

| Component     | Guide | Rules the types and tests enforce                                              |
| ------------- | ----- | ------------------------------------------------------------------------------ |
| `Button`      | C1    | `disabled` needs a `disabledReason`; `loading` locks the button and says why   |
| `FormField`   | C9    | Label above; errors use icon + text (never colour alone); required is spelled out |
| `Modal`       | C10   | Cancel left, action right; focus is trapped and returned                       |
| `ConfirmDialog` | C10 | `destructive` needs `itemName`; the dialog can't close mid-action; failures stay visible |

Tokens live in `src/tokens.css` (Tailwind v4 `@theme`). Import them once in the app's `globals.css`.

```
pnpm --filter @jogylink/ui test
pnpm --filter @jogylink/web dev   # then open /dev/components
```
