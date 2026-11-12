# 005 — Stop the wide page swap from showing two pages at once (only if slow motion shows it)

- **Status**: TODO (gated: Step 0 decides)
- **Commit**: b9c6ba9
- **Severity**: LOW
- **Category**: Cohesion (crossfade)
- **Estimated scope**: 1 file, ~6 lines
- **Depends on**: 000 and 001, for the Step 0 check

## Problem

On the wide layout, picking a sidebar item stacks the new page on top of the old one, both `position: absolute; top: 0`:

- The old page fades out over 120ms (`data-leave`).
- The new page fades up 8px over 220ms (`data-enter` → shown).

Both start on the same frame (`app/actions/public/wide/wide-home.tsx:285-308`), so for most of the first 120ms both pages are partly visible on top of each other. On dense pages (standings tables, the club page's lists), that can read as doubled text.

```ts
// app/actions/public/wide/wide-home.tsx:501-524 — current
const pageStyles = css({
  position: 'absolute',
  …
  transition: `opacity 220ms ${v('--ease-out')}, transform 220ms ${v('--ease-out')}`,

  '&[data-enter]': {
    opacity: 0,
    transform: `translateY(${space(2)})`,
    transition: 'none',
  },

  '&[data-leave]': {
    opacity: 0,
    transitionDuration: '120ms',
  },
});
```

**Unconfirmed.** With `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) the old page is mostly gone within about 40ms, so the overlap may be invisible. Step 0 decides.

## Step 0 — decide with the lab (required)

1. Plan 001: `bun run motion:capture --url <main> --label before --interaction wide-page-swap --scale 0.25`. Do it once from a club page to another club page, and once from a club page to a competition page: edit the interaction's click target, or pick the item by hand in the lab.
2. In the trace, count the frames where both `old.opacity > 0.15` and `next.opacity > 0.15`, and convert to animation time.
3. **Proceed only if** that overlap is **≥ 50ms** of animation time **and** the ¼× video shows legible doubled text. Otherwise set **Status: NO-CHANGE** with the numbers, and stop.

## Target

Option A comes first. Hide the overlap by blurring the leaving page slightly, which stops two sharp layers of text from competing:

```ts
// wide-home.tsx — target for the '&[data-leave]' rule
  '&[data-leave]': {
    opacity: 0,
    filter: 'blur(2px)',
    transition: `opacity 120ms ${v('--ease-out')}, filter 120ms ${v('--ease-out')}`,
  },
```

Check option A with the perf HUD (`?perf=1`) in **Safari**, where `filter` is the risk. If a page swap drops 2 or more frames at 1×, use **option B** instead and revert A. Option B holds the new page back until the old one has mostly gone:

```ts
// wide-home.tsx — option B: base transition gets a 60ms delay, leaving resets it
  transition: `opacity 220ms ${v('--ease-out')} 60ms, transform 220ms ${v('--ease-out')} 60ms`,
  …
  '&[data-leave]': {
    opacity: 0,
    transitionDuration: '120ms',
    transitionDelay: '0ms',
  },
```

Use exactly one of A or B.

## Repo conventions to follow

- Keep all state rules inside `pageStyles`. Remix gives each `css()` class its own cascade layer, so a separate mixin can lose regardless of specificity. Exemplar: `app/actions/public/standings/standings-sheet.tsx:128-138`.
- Transition timing uses `v('--ease-out')`. No new curves.
- Blur stays at 2px. Never go above about 20px during a transition (Safari cost).

## Boundaries

- Do NOT change `PAGE_LEAVE_MS` (160) or the enter/shown/leave state machine in `syncPages`.
- Do NOT change the 8px rise or the 220ms entrance duration.
- If Step 0 says no, change no code.

## Verification

- **Mechanical**: `bun run typecheck` and `bun test` pass. `wide-home.test.browser.tsx` should pass unchanged.
- **Feel check**: wide viewport (951×620), `/?motion=0.25`. Switch club → club, club → competition, and competition → club.
  - At ¼×, there's no moment where two sets of sharp text overlap.
  - At 1×, the swap still feels instant and the new page still rises slightly.
  - Safari with `?perf=1`: no new dropped frames on a swap.
- **Before/after**: plan 001 `wide-page-swap` on `main` vs this branch. The both-visible overlap shrinks (option B), or stays while the old page is blurred (option A, which you check in the video).
- **Done when**: Step 0's numbers are written here, and either A or B is in with the checks passing, or the plan is marked NO-CHANGE.
