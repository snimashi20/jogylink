# @jogylink/web

Next.js 15 (App Router) front end. Admin screens will live in the `(admin)` route group and the
customer shop in `(shop)`.

- Styling: Tailwind v4, tokens from `@jogylink/ui/tokens.css`.
- Fonts: self-hosted from npm (`@fontsource`), so builds need no Google Fonts access.
- `/dev/components`: the component gallery. It returns 404 in production builds.

```
pnpm --filter @jogylink/web dev
```

## Signing in

The browser never talks to the API and never sees the login token. It posts the username and
password to this app's own `/session` route, which forwards them to the API and stores the token
in an httpOnly cookie. Pages that need a user call `requireUser()` (`lib/session.ts`); it asks the
API who the cookie belongs to on every request, so a deactivated account stops working at once.

The `(admin)` pages are for the owner. A worker who signs in here sees a short "this area is for
the owner" message. The API enforces roles itself; this only decides what to show.

Set `API_URL` (see `.env.example`) so the web server can find the API.

## Calling the API from a page

- **Server components** use `apiGet()` from `lib/server-api.ts`.
- **Client components** use `callApi()` from `lib/client-api.ts`. It goes through the app's own
  `/backend/...` route, which adds the login token from the cookie. Writes must be JSON, and paths
  that try to climb out of the API are refused. The API still decides who may do what.
- Money is typed in rupees and converted with the shared helpers, so a price never passes through
  floating-point arithmetic. The "website price" preview uses the same function as the server.
