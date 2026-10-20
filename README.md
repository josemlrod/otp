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

## Environment

Copy `.env.example` to `.env` and set `FOOTBALL_DATA_API_KEY` to your [football-data.org](https://www.football-data.org/client/register) key. The `dev`, `hmr`, and `start` scripts load `.env` if it exists. In production the key is a Fly secret:

```sh
fly secrets set FOOTBALL_DATA_API_KEY=<key>
```

## Performance HUD

Press <kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> (or open the app with `?perf=1` on a phone) to show a live overlay with fps and a frame-time graph, dropped frames, long frames, input latency, per-component render counts, DOM nodes and mutations, JS heap, and load timings. It works in dev and production, stays on across reloads, and `?perf=0` or the same shortcut hides it. Tap the fps row to collapse it. Its code (`app/actions/public/perf/`) only loads once it's first shown.

To count a component's renders, call `countRender('Name')` at the top of its render function.

Some metrics are Chromium-only (JS heap, long frames) and show `n/a` elsewhere. Chrome rounds heap sizes unless launched with `--enable-precise-memory-info`.
