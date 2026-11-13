# Otp

A minimal Remix application starter with a home page.

## Find Your Way Around

- [ARCHITECTURE.md](ARCHITECTURE.md): the components and how they connect, with diagrams
- [CONTEXT.md](CONTEXT.md): what things are called
- [docs/adr/](docs/adr/): why things are the way they are

## Starter Shape

- `app/actions/controller.tsx` owns the top-level route actions.
- `app/actions/home-page.tsx` and `app/actions/document.tsx` render the route-owned starter UI.
- `app/actions/public/` contains the browser runtime entry and the client components it hydrates.
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

## Performance HUD

Press <kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, tap the logo or title five times quickly (the way to open it in the installed PWA), or open the app with `?perf=1` to show a live overlay with fps and a frame-time graph, dropped frames, long frames, input latency, per-component render counts, DOM nodes and mutations, JS heap, and load timings. It works in dev and production, stays on across reloads, and the same shortcut, the same taps, or `?perf=0` hides it. Tap the fps row to collapse it. Its code (`app/actions/public/perf/`) only loads once it's first shown.

To count a component's renders, call `countRender('Name')` at the top of its render function.

Some metrics are Chromium-only (JS heap, long frames) and show `n/a` elsewhere. Chrome rounds heap sizes unless launched with `--enable-precise-memory-info`.

## Dev scenarios

Run without an API key using `OTP_SCENARIO=matchday bun run dev`. The same variable works with `bun run hmr`. `matchday` includes all six tracked competitions, varied form, and kickoff within a few hours. `api-down` simulates an outage; `league-down` is like `matchday`, with BL1 standings returning 503 and Bayern absent from CL standings; `no-fixtures` gives Arsenal no upcoming fixtures. Scenarios use an in-memory cache and dates relative to startup.

Set the browser cookie `otp_follows=57.64.5` to show Arsenal, Liverpool and Bayern club cards on the home screen. Unknown names fail at startup and list the valid names. Scenarios are rejected with `NODE_ENV=production`, including `bun run start`; to run the server directly use `OTP_SCENARIO=matchday NODE_ENV=development node --import remix/node-tsx server.ts`.

Pin a reproducible home render with `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London bun run hmr`.
`OTP_NOW` must be an ISO instant with `Z` or an explicit offset. It freezes scenario dates, cache timestamps, freshness, countdowns and the header date. `OTP_TZ` must be an IANA timezone and keeps that display timezone after hydration. Either override can be used independently, including without a scenario. Invalid values fail at startup; both are refused when `NODE_ENV=production`.

Without overrides, the server uses the `otp_tz` cookie or UTC on a first visit. Hydration first uses the server's clock and timezone, then saves the browser's timezone and updates the display. The browser anchors its clock to the server timestamp so device clock skew does not affect freshness.

## Motion lab

Press Option+Shift+M, open `?motion=0.25`, or tap the Performance HUD's `motion` button on a phone. The lab loads on demand. Its saved speed survives reloads; `?motion=0` or the shortcut hides it and restores normal speed. Tap the header to collapse it to a speed pill, which turns amber while slowed or paused.

Choose 1×, ½×, ¼× or ⅒× to slow CSS transitions, WAAPI animations and release springs together. Pause with ⏸; ⇥ advances one 60 Hz animation frame while paused. Pointer tracking, release velocity and press delays stay in real time.

Use `pick` and tap an element to select it, ↑ to pick its parent, or × to clear it. The green outline follows the target. `● rec` records every frame until motion settles; ■ stops early. The summary shows animation duration, frame count, peak velocity, overshoot and first-frame jump. Choose a channel under the plot: dots show sampled frames and a faint line shows velocity on its own scale. Scrub the slider to inspect a frame and its dashed position outline. `copy json` copies the trace (or logs it if clipboard access fails).

CSS transitions are first discovered on the frame after they start, so their first frame runs at full speed (about 16ms). Native smooth scrolling (`scrollBy` / `scrollIntoView`) cannot be slowed.

For scripts, `?motion=0.25&motionPanel=0` enables the lab without its panel. `window.__otpMotion` exposes `setScale(number)`, `step()`, `record({ name: selectorOrElement })` (returns `{ done, stop }`) and `summarize(samples, channel)`. Trace times and velocities use animation time.

### Before and after

Install browser binaries once with `bunx playwright install chromium webkit`. The BEFORE ref must already contain plan 000's lab. Serve both versions on the pinned scenario in separate terminals:

```sh
PORT=44101 OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London NODE_ENV=development node --import remix/node-tsx server.ts
PORT=44102 OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London NODE_ENV=development node --import remix/node-tsx server.ts
```

Capture each side, then build the static report:

```sh
bun run motion:capture --url http://localhost:44101 --label before --interaction sheet-flick-close
bun run motion:capture --url http://localhost:44102 --label after --interaction sheet-flick-close
bun run motion:report --interaction sheet-flick-close
```

Open `motion-captures/sheet-flick-close/report.html` for videos, position and velocity curves, and stats. Captures are ignored by git. Use `--interaction all` for all six interactions, `--browser webkit`, `--scale 0.1`, `--reduced` or `--out <directory>` as needed. Reports accept `--before <label>`, `--after <label>` and `--out <directory>`. Signed deltas have no success colour because the desired direction depends on the fix.
