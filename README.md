# Otp

A minimal Remix application starter with a home page.

## Starter Shape

- `app/actions/controller.tsx` owns the top-level route actions.
- `app/actions/home-page.tsx` and `app/actions/document.tsx` render the route-owned starter UI.
- `app/actions/public/` contains the browser runtime entry and interactive prompt button.
- `app/routes.ts` defines the shared route contract used by server and browser modules for type-safe hrefs.
- `app/router.ts` wires routes to handlers and installs the standard Remix component renderer used by actions.
- `app/assets.ts` owns the server-side asset pipeline used by the asset route and render middleware.
- Root `public/` contains static files served unchanged from the app root.

## Growing The App

- Put top-level route actions in `app/actions/controller.tsx`.
- Add `app/actions/<route-key>/controller.tsx` when a nested route map needs its own actions or middleware.
- Add directories like `app/data/` or `test/` when the app actually needs them.
- Move shared UI into `app/ui/` once more than one route needs it.

## Commands

```sh
bun i
bun run dev
bun run hmr
bun run start
bun test
bun run typecheck
```

## Testing On Your Phone

```sh
bun run hmr:lan
```

This runs the HMR dev server on all network interfaces and prints an `On your network:` URL. Open that URL on a phone connected to the same Wi-Fi, and saved changes show up live. If macOS asks whether `node` can accept incoming connections, allow it.

## Environment

Copy `.env.example` to `.env` and set `FOOTBALL_DATA_API_KEY` to your [football-data.org](https://www.football-data.org/client/register) key. The `dev`, `hmr`, and `start` scripts load `.env` if it exists. In production the key is a Fly secret:

```sh
fly secrets set FOOTBALL_DATA_API_KEY=<key>
```
