# @jogylink/web

Next.js 15 (App Router) front end. Admin screens will live in the `(admin)` route group and the
customer shop in `(shop)`.

- Styling: Tailwind v4, tokens from `@jogylink/ui/tokens.css`.
- Fonts: self-hosted from npm (`@fontsource`), so builds need no Google Fonts access.
- `/dev/components`: the component gallery. It returns 404 in production builds.

```
pnpm --filter @jogylink/web dev
```
