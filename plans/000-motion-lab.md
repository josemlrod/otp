# 000 — Add a motion lab: slow motion, pause, frame step, and a per-element trace

- **Status**: DONE
- **Commit**: b9c6ba9
- **Severity**: Tooling (prerequisite for every other plan)
- **Category**: Debug tooling
- **Estimated scope**: 1 file changed in `motion.ts`, 3 call sites touched, 4 new files under `app/actions/public/motion-lab/`, 1 new browser test; ~600 lines

## Problem

There is no way to watch an animation slowly. The perf HUD (`app/actions/public/perf/`, Option+Shift+P or `?perf=1`) measures frame times and render counts only.

OTP's motion runs on three clocks, and a slow-motion tool must control all three:

1. **CSS transitions and keyframes.** Examples: sheet open/close (`app/actions/public/sheet.tsx:321-342, 385-387`), club focus height (`app/actions/public/clubs/club-list.tsx:300`), and every press state.
2. **WAAPI `element.animate()`.** The club picker's crest fly and chip exit (`app/actions/public/clubs/club-picker.tsx:94-110, 144-163`).
3. **The hand-rolled spring engine.** `Value` in `app/actions/public/motion.ts` reads real time directly:

```ts
// app/actions/public/motion.ts:74-81 — current
    return new Promise<boolean>((resolve) => {
      this.#resolve = resolve;
      let last = performance.now();
      const step = (now: number) => {
        const elapsed = Math.min(0.05, (now - last) / 1000);
        last = now;
```

A few `setTimeout`/`performance.now()` calls also pace animation. They would fall out of sync with slowed motion:

```ts
// app/actions/public/clubs/club-list.tsx:40-47 — current (keeps the edge fades live while heights animate)
  const follow = (ms: number) => {
    const until = performance.now() + ms;
    const tick = () => {
      updateEdges();
      if (performance.now() < until && !handle.signal.aborted) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
```

```ts
// app/actions/public/clubs/club-list.tsx:85 — current
    setTimeout(() => {
```

```ts
// app/actions/public/wide/wide-home.tsx:303-306 — current (drops the faded-out page)
      setTimeout(() => {
        pages = pages.filter((page) => page.state !== 'leave');
        handle.update();
      }, PAGE_LEAVE_MS);
```

## Target

Everything below is enabled at runtime, lazy-loaded, and costs nothing when off. It follows the perf HUD pattern.

### A. Animation time: `motionTime` in `motion.ts`

Animation time equals `performance.now()` until the lab changes the scale. Pointer input, velocity tracking and press-and-hold delays stay in real time. You drag at normal speed; what plays after you let go is slowed.

```ts
// app/actions/public/motion.ts — add below `reduced`
type TimeState = { scale: number; anchorReal: number; anchorVirtual: number };
const sharedAcrossHmr = globalThis as typeof globalThis & { __otpMotionTime?: TimeState };
const time: TimeState = (sharedAcrossHmr.__otpMotionTime ??= { scale: 1, anchorReal: 0, anchorVirtual: 0 });

/**
 * Animation time in ms. Same as performance.now() unless the motion lab slowed or paused it.
 * Pointer input, velocity and press delays stay in real time; only what animates is scaled.
 */
export const motionTime = {
  now(real = performance.now()) {
    return time.anchorVirtual + (real - time.anchorReal) * time.scale;
  },
  get scale() {
    return time.scale;
  },
  /** 1 is real time, 0.25 is quarter speed, 0 pauses. */
  setScale(scale: number) {
    const real = performance.now();
    time.anchorVirtual = motionTime.now(real);
    time.anchorReal = real;
    time.scale = scale;
  },
  /** Moves animation time forward without real time passing (one 60 Hz frame by default). */
  step(ms = 1000 / 60) {
    time.anchorVirtual += ms;
  },
  /** setTimeout in animation time. Returns a cancel function. */
  after(ms: number, callback: () => void): () => void {
    if (time.scale === 1) {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    }
    const due = motionTime.now() + ms;
    let frame = requestAnimationFrame(function wait(now) {
      if (motionTime.now(now) >= due) return callback();
      frame = requestAnimationFrame(wait);
    });
    return () => cancelAnimationFrame(frame);
  },
};

export const prefersReducedMotion = reduced;
```

(`prefersReducedMotion` is exported now because plan 003 needs it. It is harmless here.)

`Value.to` reads animation time:

```ts
// app/actions/public/motion.ts — target for lines 76-79
      let last = motionTime.now();
      const step = (now: number) => {
        const at = motionTime.now(now);
        const elapsed = Math.min(0.05, (at - last) / 1000);
        last = at;
```

Leave everything else in `Value.to` alone. A zero `elapsed` while paused is fine: the loop keeps scheduling frames without moving.

### B. Pacing call sites use animation time

- `app/actions/public/clubs/club-list.tsx:41,44`: `performance.now()` → `motionTime.now()` (two places inside `follow`).
- `app/actions/public/clubs/club-list.tsx:85-95`: `setTimeout(() => { … }, HEIGHT_MS * 0.5)` → `motionTime.after(HEIGHT_MS * 0.5, () => { … })`. Keep the body identical.
- `app/actions/public/wide/wide-home.tsx:303-306`: `setTimeout(() => {…}, PAGE_LEAVE_MS)` → `motionTime.after(PAGE_LEAVE_MS, () => {…})`.
- Import `motionTime` from `'../motion.ts'`. Both files already import from it, or from `'../../motion.ts'` depending on depth. Use the existing relative depth.

**Do not convert** these. They are input timing, not animation:

- `timeline.ts:168` (`SCRUB_DELAY`)
- `sheet.tsx` `STILL_FINGER_LOSES_FLICK_AFTER_MS`
- `motion.ts` `tracker`
- `club-picker.tsx:185,206` (`SPY_LOCK_MS`)
- `wide-home.tsx:205` and `timeline.ts:299` (`setTimeout(..., 0)` click swallowing)

### C. CSS and WAAPI follow the same scale

In `app/actions/public/motion-lab/rate.ts` (lazy, only loaded with the lab):

```ts
import { motionTime } from '../motion.ts';

const STEP_MS = 1000 / 60;
const pausedByLab = new Set<Animation>();
let frame = 0;
let originalAnimate: typeof Element.prototype.animate | null = null;

function apply(animation: Animation) {
  const scale = motionTime.scale;
  if (scale === 0) {
    if (animation.playState === 'running') {
      animation.pause();
      pausedByLab.add(animation);
    }
    return;
  }
  if (pausedByLab.delete(animation)) animation.play();
  if (animation.playbackRate !== scale) animation.updatePlaybackRate(scale);
}

function sweep() {
  for (const animation of document.getAnimations()) apply(animation);
  frame = requestAnimationFrame(sweep);
}

/** Starts following motionTime.scale. Call once when the lab mounts; returns an uninstall. */
export function installRateControl() {
  originalAnimate = Element.prototype.animate;
  const original = originalAnimate;
  Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
    const animation = original.apply(this, args);
    apply(animation); // WAAPI starts slowed from its first frame
    return animation;
  };
  frame = requestAnimationFrame(sweep);
  return () => {
    cancelAnimationFrame(frame);
    if (originalAnimate) Element.prototype.animate = originalAnimate;
    for (const animation of document.getAnimations()) {
      if (pausedByLab.delete(animation)) animation.play();
      animation.updatePlaybackRate(1);
    }
  };
}

/** While paused, moves every paused animation forward one frame, in step with motionTime.step(). */
export function stepAnimations(ms = STEP_MS) {
  for (const animation of pausedByLab) {
    animation.currentTime = Number(animation.currentTime ?? 0) + ms;
  }
}
```

Known limits. Write them in the lab panel's help line and in the docs below:

- A CSS transition is first seen by the sweep on the frame after it starts, so its first frame plays at full speed (about 16ms).
- `scrollBy({ behavior: 'smooth' })` and `scrollIntoView({ behavior: 'smooth' })` can't be slowed.

### D. Trace recorder

`app/actions/public/motion-lab/trace.ts`. It has no UI, so the panel and the Playwright harness (plan 001) can both use it.

```ts
export type Sample = {
  real: number;     // rAF timestamp, ms
  t: number;        // animation time since the recording started, ms
  x: number; y: number; w: number; h: number;   // getBoundingClientRect (includes ancestor transforms)
  tx: number; ty: number; sx: number; sy: number; // the element's own computed transform
  opacity: number;
  radius: number;   // computed border-top-left-radius in px
};
export type Trace = { scale: number; startedAt: string; targets: Record<string, Sample[]> };

/**
 * Samples each target once per frame. A selector is resolved lazily (the element may not
 * exist yet, e.g. the picker's flying ghost) and then held, even if it stops matching (a
 * page losing data-enter). Stops when every resolved target has been still for STILL_FRAMES
 * frames after something moved, or after maxRealMs.
 */
export function record(
  targets: Record<string, string | Element>,
  { maxRealMs = 8000, stillFrames = 20 } = {},
): { done: Promise<Trace>; stop: () => Trace };
```

Rules:

- **Sampling.** `getBoundingClientRect()`, then `getComputedStyle(el)`. Decompose the transform with `new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)`: `tx = e`, `ty = f`, `sx = Math.hypot(a, b)`, `sy = Math.hypot(c, d)`. Read `opacity` with `parseFloat`, and `radius` with `parseFloat(style.borderTopLeftRadius)`.
- **"Still".** Every numeric field differs from the previous sample by less than 0.01.
- **Recording window.** Recording starts immediately. Trim the leading samples where nothing has changed yet down to 3, and trim the still tail down to 3.
- **Time.** `t` uses `motionTime.now(rafTimestamp)` minus the value at the first kept sample.

`app/actions/public/motion-lab/stats.ts` holds pure functions with no DOM. Plan 001's report reuses them from Node.

```ts
import type { Sample } from './trace.ts';
export type Channel = 'x' | 'y' | 'w' | 'h' | 'tx' | 'ty' | 'sx' | 'sy' | 'opacity' | 'radius';
export const CHANNELS: Channel[] = ['y', 'x', 'ty', 'tx', 'sx', 'opacity', 'w', 'h', 'radius'];

/** Units per second of animation time, one value per sample (first is 0). */
export function velocities(samples: Sample[], channel: Channel): number[];

export type Summary = {
  durationMs: number;      // animation time from first change to last change
  frames: number;          // real frames sampled in that window
  peakVelocity: number;    // max |velocity|, units/s
  overshoot: number;       // furthest travel past the final value, in the direction of travel (0 if none)
  firstFrameJump: number;  // |value[first changed sample] − value[sample before it]|: a teleport shows here
  maxFrameDelta: number;   // largest single-frame change: a lurch or jump shows here
};
export function summarize(samples: Sample[], channel: Channel): Summary;

/** The channel that moved the most (by range), used as the default plot. */
export function dominantChannel(samples: Sample[]): Channel;
```

### E. Lab panel

`app/actions/public/motion-lab/lab.ts` exports `mountMotionLab({ onClose }): () => void`. It builds a `<otp-motion-lab>` custom element with an open shadow root, using the same approach as `app/actions/public/perf/hud.ts:131-148`: plain DOM, an inline `<style>`, and `all: initial` on `:host`. Position it bottom-left: `left: calc(env(safe-area-inset-left, 0px) + 6px); bottom: calc(env(safe-area-inset-bottom, 0px) + 6px)`, so it doesn't sit on the HUD (top-right). Copy the HUD's panel look: `background: oklch(0% 0 0 / 0.82)`, the 12px backdrop blur, 10.5px monospace, and `width: 268px`.

Rows, top to bottom:

1. **Speed.** Buttons `1×  ½×  ¼×  ⅒×` call `motionTime.setScale(1 | 0.5 | 0.25 | 0.1)`. The active one is highlighted with `background: oklch(100% 0 0 / 0.22)`. Then `⏸`/`▶`, which toggles `setScale(0)` and restores the previous non-zero scale. Then `⇥`, enabled only while paused, which calls `motionTime.step(); stepAnimations();`.
2. **Target.** `pick` arms picking: the next primary `pointerdown` anywhere outside the lab is taken in the capture phase with `preventDefault()` + `stopPropagation()`, and the click that follows is swallowed. It picks the first element from `document.elementsFromPoint(x, y)` that isn't the lab host. Draw a 1px `oklch(91.1% 0.197 124.6)` outline box over the picked element (a fixed div inside the shadow root, `pointer-events: none`). Next to it: a label (tag plus up to two `data-*` attribute names, e.g. `section [role=dialog]`), `↑` (pick the parent), and `×` (clear).
3. **Record.** `● rec` starts `record({ target: picked })`, and `■` stops it. When a recording ends, show the summary for the dominant channel on one line: `512ms · 31 fr · v 2140/s · over 3.2 · jump 0.0`.
4. **Plot.** A 252×110 canvas showing the selected channel against animation time. Draw a line plus **one dot per sampled frame** (frame spacing is the point). Draw velocity as a faint second line on its own scale. Channel buttons for the `CHANNELS` that moved (range > 0.5) sit under the canvas.
5. **Scrub.** An `<input type="range">` over the recorded samples. Moving it shows `f 12/58 · t 196ms · y 412.0 · v −1830/s` and moves a second outline box (dashed) to that sample's `x/y/w/h`, so you can see where the element was on that frame.
6. **Actions.** `copy json` (`navigator.clipboard.writeText(JSON.stringify(trace))`, falling back to `console.log`) and `hide ⌥⇧M`.

When collapsed (tap the header, saved in `localStorage` key `otp:motion-compact`), show only the speed pill. Colour it `--color-warning` (read from the host's computed style, as `hud.ts:150-155` does) whenever the scale isn't 1, so a slowed app is never mistaken for a slow app.

The lab calls `installRateControl()` on mount and its uninstall on unmount. Unmount also does `motionTime.setScale(1)`.

### F. Toggle and scripting API

`app/actions/public/motion-lab/toggle.ts` exports `installMotionLabToggle()`. It mirrors `app/actions/public/perf/toggle.ts`:

- `localStorage` key `otp:motion`: the saved scale as a string when the lab is visible, removed when hidden.
- URL param `motion`. `?motion=0.25` shows the lab at quarter speed; `?motion=1` shows it at real speed; `?motion=0` hides it. `?motionPanel=0` mounts the lab logic (rate control and API) **without** the panel, for clean video captures.
- **Option+Shift+M** (`event.code === 'KeyM'`) toggles it.
- A `window` event `otp:motion-lab-toggle` toggles it, which lets phones reach it from the HUD.
- On mount, expose:

```ts
window.__otpMotion = {
  setScale: motionTime.setScale,
  step: () => { motionTime.step(); stepAnimations(); },
  record,            // from trace.ts
  summarize,         // from stats.ts
};
```

Delete `window.__otpMotion` on unmount. Declare the type in `toggle.ts` with `declare global { interface Window { __otpMotion?: … } }`.

Wire it up:

- `app/actions/public/entry.ts`: add `import { installMotionLabToggle } from './motion-lab/toggle.ts'` and call `installMotionLabToggle()` right after `installPerfToggle()` (line 29).
- `app/actions/public/perf/hud.ts:143-146` (the `.actions` div): add a third action button `<button type="button" data-action="motion">motion</button>` before `reset`. In the click handler (`hud.ts:164-176`), add `else if (action === 'motion') window.dispatchEvent(new Event('otp:motion-lab-toggle'));`.

## Repo conventions to follow

- Lazy-load exactly like `app/actions/public/perf/toggle.ts:26`: `const { mountMotionLab } = await import('./lab.ts');`. Nothing in `lab.ts`, `rate.ts`, `trace.ts` or `stats.ts` may be imported eagerly from app code. Only `motionTime` lives in `motion.ts`.
- The HMR-safe singleton pattern is `app/actions/public/perf/renders.ts:5-11` (`globalThis.__otp…`).
- `localStorage` access is always wrapped in `try/catch` (`perf/toggle.ts:68-81`).
- The lab is dev tooling inside a shadow root, so literal colours and px are fine there, as in `hud.ts`. Don't add theme tokens for it.
- Use "animation time" in comments and names, never "clock": `Clock` already means match time in CONTEXT.md and `app/lib/clock.ts`.

## Steps

1. `motion.ts`: add `motionTime` and `prefersReducedMotion` (Target A), and change `Value.to` to use `motionTime.now` (Target A, lines 76-79).
2. Convert the three call sites (Target B).
3. Create `motion-lab/rate.ts` (Target C).
4. Create `motion-lab/trace.ts` and `motion-lab/stats.ts` (Target D).
5. Create `motion-lab/lab.ts` (Target E).
6. Create `motion-lab/toggle.ts` and wire `entry.ts` and `hud.ts` (Target F).
7. Create `app/actions/public/motion-lab/lab.test.browser.ts` with these tests. Each test restores `motionTime.setScale(1)` in `t.after`:
   - **"animation time runs at the chosen scale"**: `setScale(0.5)`, wait 100ms real (`setTimeout`), and assert `motionTime.now()` advanced between 35 and 65ms. Then `setScale(0)`, wait 50ms, and assert no advance. Then `step()` and assert an advance of 16.67 ± 0.01.
   - **"a paused spring holds still and steps one frame at a time"**: `new Value(0, cb)`, `setScale(0)`, `value.to(100)`, await 3 frames, and assert `value.value === 0`. Then `motionTime.step()`, await 1 frame, and assert `value.value > 0`.
   - **"WAAPI animations start at the lab's rate"**: call `installRateControl()`, `setScale(0.25)`, and `el.animate([{opacity:0},{opacity:1}], 200)`, then assert `playbackRate === 0.25`. Uninstall and assert `playbackRate === 1`.
   - **"the recorder samples every frame and summarises the motion"**: `record({ box: el })`, then `el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], { duration: 200, fill: 'forwards' })`. Await `done`. Assert at least 8 samples for `box`, the last `tx` ≈ 100 (±0.5), `summarize(samples,'tx').overshoot === 0`, and `firstFrameJump < 20`.
8. Add a section **Motion lab** to `README.md` after the scenario paragraph (line 64). Cover how to open it (⌥⇧M, `?motion=0.25`, the HUD's `motion` button on a phone), what each control does, and the two known limits from Target C.

## Boundaries

- Do NOT change any animation's values, curves or durations. This plan only adds the ability to watch them.
- Do NOT scale input timing (the list in Target B).
- Do NOT add dependencies.
- With the lab off, `motionTime.now()` must return exactly `performance.now()`, so all existing tests behave identically.
- If any quoted line doesn't match what you find (drift since `b9c6ba9`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `bun run typecheck` passes. `bun test` passes, including the existing `sheet.test.browser.tsx`, `club-card.test.browser.tsx`, `home-screen.test.browser.tsx` and `wide-home.test.browser.tsx` with no edits, plus the new lab tests.
- **Feel check**: `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London bun run hmr`, with cookie `otp_follows=57.64.5`, then open `/?motion=0.25`.
  - Tap a competition tile. The sheet rises 4× slower and the screen behind recedes in sync. Nothing finishes early.
  - Scrub a club card's form pills and release. The lens spring settles 4× slower. While you drag, the lens tracks your finger at full speed.
  - Pause, then tap `⇥` repeatedly during a sheet rise. Both the sheet (CSS) and, during a pager swipe, the track (spring) advance one frame per tap.
  - Pick the sheet (`[role=dialog]`), record, and tap a tile. The plot shows `y` easing in, with dots bunched near the end (ease-out), and the summary shows about 480ms.
  - Open the picker and tap a club at ⅒×. The crest ghost flies slowly and the chip pops in after it.
  - Set ¼× and reload. The lab comes back at ¼× and the collapsed pill is amber.
- **Done when**: all three motion sources slow, pause and step together, a trace can be recorded and copied as JSON, and `window.__otpMotion` exists with `?motionPanel=0`.

## Implementation notes

- CSS transitions run their first frame at full speed before rate control discovers them.
  Native smooth scrolling cannot be slowed.
- `motionTime.after` scheduled at scale 1 uses `setTimeout` and does not adopt a later slowdown.
  Hiding the lab restores scale 1 but keeps the animation-time offset to avoid jumping active motion.
- The panel-less mount and persisted scripting API share the same lazy import. WAAPI tests wait for
  `animation.ready` because playback-rate updates apply asynchronously. Capture helpers wait one
  frame before input so existing targets resolve and have a baseline.
- Scale and opacity use a 0.00001 stillness threshold; pixel channels retain 0.01.
- Detached targets stop contributing samples and count as settled. Reports select explicit channels
  per interaction; wide-page overlap linearly interpolates the 0.15 opacity crossings on shared `t`.
  Report deltas remain signed and neutral because expected improvement depends on the later plan.
- Sheet close uses a fast pull past 70% of travel, safely beyond the half-travel threshold even with
  zero measured velocity. Short pull and catch hold 150ms to clear the 100ms release velocity window.
  These choices preserve outcomes under today's release and plan 002's projected release decision.
