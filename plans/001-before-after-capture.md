# 001 — Add a before/after capture harness for animations

- **Status**: TODO
- **Commit**: b9c6ba9
- **Severity**: Tooling (prerequisite for proving 002–005)
- **Category**: Debug tooling
- **Estimated scope**: 4 new files under `scripts/motion/`, `package.json` scripts, `.gitignore`; ~450 lines
- **Depends on**: 000 (needs `window.__otpMotion` and `app/actions/public/motion-lab/stats.ts`)

## Problem

Each animation fix needs proof of what changed. Today the only way to compare is two devices side by side and memory. We want the same interaction, driven the same way, on the same frozen data, recorded on `main` and on the fix branch. The output should be:

- side-by-side slow-motion videos, and
- the measured motion curves overlaid, with numbers (duration, peak speed, overshoot, first-frame jump).

The repo already has what this needs:

- `playwright` 1.64.1 is a devDependency (`package.json:21`).
- Scenarios and a frozen clock: `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London` (`README.md:59-64`).
- The server port comes from `PORT` (`server.ts:20`).
- Followed clubs come from the `otp_follows` cookie (`README.md:61`).

## Target

### Commands

```sh
# 1. Serve both versions on a frozen scenario (run each in its own terminal)
PORT=44101 OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London NODE_ENV=development node --import remix/node-tsx server.ts   # in a worktree of the BEFORE ref
PORT=44102 OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London NODE_ENV=development node --import remix/node-tsx server.ts   # in the AFTER worktree

# 2. Capture
bun run motion:capture --url http://localhost:44101 --label before --interaction sheet-flick-close
bun run motion:capture --url http://localhost:44102 --label after  --interaction sheet-flick-close

# 3. Compare
bun run motion:report --interaction sheet-flick-close
# → motion-captures/sheet-flick-close/report.html
```

`package.json` scripts:

```json
"motion:capture": "node --import remix/node-tsx scripts/motion/capture.ts",
"motion:report": "node --import remix/node-tsx scripts/motion/report.ts"
```

Add `motion-captures/` to `.gitignore`.

**Important:** the BEFORE ref must already contain plan 000, or `window.__otpMotion` won't exist. Merge 000 and 001 to `main` before starting 002. The BEFORE for each later plan is then the `main` it branched from.

### `scripts/motion/capture.ts`

Parse args with `node:util` `parseArgs`. Options and defaults:

- `--url` (required)
- `--label` (required, e.g. `before` or `after`)
- `--interaction` (required; a name from `interactions.ts`, or `all`)
- `--scale` (default `0.25`)
- `--browser` (`chromium` | `webkit`, default `chromium`)
- `--reduced` (flag)
- `--out` (default `motion-captures`)

For each interaction:

1. `const browser = await (await import('playwright'))[options.browser].launch();`
2. Create the context:

   ```ts
   browser.newContext({
     viewport: interaction.viewport ?? { width: 402, height: 874 },
     deviceScaleFactor: 2,
     hasTouch: true,
     colorScheme: 'dark',
     reducedMotion: reduced ? 'reduce' : 'no-preference',
     recordVideo: { dir: tmpDir, size: interaction.viewport ?? { width: 402, height: 874 } },
   })
   ```

   Then add the cookie `otp_follows=57.64.5` for `new URL(url).hostname`.
3. Go to `${url}/?motion=${scale}&motionPanel=0`. Wait for `performance.getEntriesByName('otp:hydrated').length > 0 && !!window.__otpMotion`, then wait one more second for matches to load.
4. `const trace = await interaction.run(page, { scale })`. Every interaction returns the `Trace` from `window.__otpMotion.record(...)`.
5. Close the context, and save the video with `page.video()!.saveAs(`${out}/${name}/${label}/video.webm`)`.
6. Write `${out}/${name}/${label}/trace.json` and `meta.json`: `{ url, label, scale, browser, reduced, viewport, capturedAt }`.

### `scripts/motion/interactions.ts`

Each interaction drives pointer input in **real time**; the lab slows only what plays afterwards. Use `page.mouse` (`button: 'left'`; OTP's handlers accept mouse pointers). Space the moves with `page.waitForTimeout` so the release speed is deliberate.

```ts
export type Interaction = {
  description: string;
  viewport?: { width: number; height: number };
  run(page: Page, opts: { scale: number }): Promise<Trace>;
};
```

Shared helpers:

- `startRecording(page, targets)`: calls `window.__otpMotion.record(targets)` inside the page and keeps the handle on `window.__otpRec`.
- `finishRecording(page)`: `return page.evaluate(() => window.__otpRec.done)`.
- `drag(page, from, to, { moves, gapMs, holdMs })`: down at `from`, then `moves` moves interpolated linearly to `to`, `gapMs` apart, wait `holdMs`, then up.

Interactions:

| name | steps | targets |
|---|---|---|
| `sheet-tap-open` | start recording, click `main button:has(img[alt$="crest"])` (first competition tile) | `{ sheet: '[role=dialog]', screen: 'main' }` |
| `sheet-flick-close` | open as above and wait for it to settle (`2000 / scale` ms), start recording, drag the sheet header (`[role=dialog] [data-sheet-grab]` centre) down 140px in 6 moves 8ms apart, holdMs 0 | same |
| `sheet-short-pull` | open and settle, start recording, drag the header down 120px in 12 moves 25ms apart, holdMs 150 | same |
| `sheet-catch` | start recording, click the first tile, wait `120 / scale` ms (mid-rise), then drag the header down 40px in 4 moves 20ms apart, holdMs 150 | same |
| `picker-fly` | click `[data-clubs-opener]`, wait for the sheet to settle, start recording, click the first `[role=dialog] [data-section] button[aria-pressed="false"]` | `{ ghost: 'body > [data-club-crest]', chip: '[data-chip]:last-of-type' }` |
| `wide-page-swap` (viewport `{ width: 951, height: 620 }`) | wait for settle, start recording, click the second `[data-item]` in the sidebar | `{ old: '[data-page]:not([data-leave])', next: '[data-page][data-enter]' }` |

`wide-page-swap`: the `old` selector resolves to the shown page before the click, and the recorder then holds that element (plan 000 Target D). `next` resolves once the new page mounts.

Wait for settle after each open: `await page.waitForTimeout(Math.ceil(600 / scale))`.

### `scripts/motion/report.ts`

Options:

- `--interaction` (required)
- `--out` (default `motion-captures`)
- `--before` (default `before`)
- `--after` (default `after`)

Read both `trace.json` and `meta.json`, import `summarize`, `velocities` and `dominantChannel` from `../../app/actions/public/motion-lab/stats.ts`, and write `${out}/${interaction}/report.html`. It is a single static file with no external assets.

- **Header.** Interaction name, its description, each side's scale, browser and URL, and whether reduced motion was on.
- **Videos.** `<video src="before/video.webm" controls muted loop playsinline>` and the same for `after`, side by side at 50% width each (stacked under 700px). Add a "play both" button that sets `currentTime = 0` and calls `play()` on both, plus a playback-rate select (1, 0.5, 0.25) applied to both.
- **One chart per target.** Use the dominant channel of the BEFORE trace for that target. Draw an inline SVG 640×220, x = animation time (ms), y = value. Before is a 1.5px dashed `#8a8f98` line, after is a 2px `#c6f432` line, each with a 2px dot per sample. Under it, a smaller 640×90 velocity chart in the same styling.
- **Stats table per target.** Rows: duration (ms), frames, peak velocity (/s), overshoot, first-frame jump, max frame delta. Columns: before, after, Δ. Colour Δ green when it moves in the plan's expected direction. Don't encode that direction; just show the signed Δ.
- **Colours.** Body background `#0b0d10`, text `#eef0f3`, font `ui-monospace`. Nothing else is needed: it's a dev report.

## Repo conventions to follow

- Scripts run TypeScript through the same loader as the server: `node --import remix/node-tsx` (`package.json:6-9`).
- Scenario values are copied from `README.md:63`. Don't invent a different pinned instant.
- Keep `scripts/motion/` free of app imports except the pure `motion-lab/stats.ts` and the `Trace`/`Sample` types from `motion-lab/trace.ts` (type-only import).

## Steps

1. Add the scripts and the `.gitignore` entry.
2. Create `scripts/motion/interactions.ts` (the table above).
3. Create `scripts/motion/capture.ts`.
4. Create `scripts/motion/report.ts`.
5. Add a "Before and after" subsection under the README's Motion lab section (from plan 000) with the three commands from Target, including the note that BEFORE must contain plan 000.

## Boundaries

- Do NOT change app code in this plan. If an interaction's selector doesn't exist, report it rather than adding attributes. The one allowed exception: if no stable selector exists for a target, add a single `data-motion="<name>"` attribute and say so in the summary.
- Do NOT add dependencies. `playwright` is already installed. Browsers are installed with `bunx playwright install chromium webkit`, which is a one-time local step; document it, don't script it.
- Do NOT commit anything under `motion-captures/`.

## Verification

- **Mechanical**: `bun run typecheck` passes.
- **Smoke run**:
  - Serve this branch on 44101, then run `bun run motion:capture --url http://localhost:44101 --label before --interaction all` and the same command with `--label after`.
  - Every interaction produces `video.webm`, `trace.json` and `meta.json`.
  - `bun run motion:report --interaction sheet-tap-open` produces a report where before and after overlap almost exactly, since it's the same build. Durations should be within 2 frames of each other.
- **Feel check**: open the `sheet-catch` report. With today's code, the `sheet` chart's `y` shows a vertical cliff when the finger lands (the sheet jumping to fully open), and `first-frame jump` or `max frame delta` is tens to hundreds of px. That's the defect plan 002 removes, so the harness has to show it.
- **Done when**: all six interactions capture on chromium, and `--browser webkit` works for at least `sheet-tap-open`.
