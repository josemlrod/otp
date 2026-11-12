# 003 — Reduced motion: fade instead of move, instead of switching everything off

- **Status**: TODO
- **Commit**: b9c6ba9
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 7 files, ~90 lines
- **Depends on**: 002 (the sheet edits assume its `gestureOwned` / `data-settling` render). 000 adds `prefersReducedMotion`; if it isn't there yet, add it as in Step 1.

## Problem

One global rule removes every CSS transition and keyframe when the user asks for reduced motion:

```ts
// app/actions/document.tsx:101-106 — current
  '@media (prefers-reduced-motion: reduce)': {
    ':where(&) *, :where(&) ::before, :where(&) ::after': {
      transition: 'none !important',
      animation: 'none !important',
    },
  },
```

This has three effects:

- **The sheet teleports.** It appears and disappears with no fade, the backdrop snaps, and the screen behind snaps to 93%.
- **Comprehension fades are lost.** The club list's row-to-card crossfade (`clubs/club-list.tsx:323, 390-396`), the scroll-edge fades (`club-list.tsx:409`, `wide/wide-home.tsx:534`), the wide page crossfade (`wide/wide-home.tsx:512-523`) and the picker's selection ripple are all gone.
- **The two engines disagree.** Everything built on `motion.ts` still moves under reduced motion: it switches to a fast, critically damped spring (`motion.ts:24, 69-71`). The pager slides and the slide-over glides, but the sheet doesn't.

Reduced motion should mean fewer and gentler animations, not none: keep opacity and colour transitions that explain a change, and drop movement.

The smooth scrolls in the club list also ignore the setting. The picker already respects it (`club-picker.tsx:189, 201`):

```ts
// app/actions/public/clubs/club-list.tsx:89-94, 121 — current
      if (y < FOCUS_PAD_PX) scroller.scrollBy({ top: y - FOCUS_PAD_PX, behavior: 'smooth' });
      else if (y + item.offsetHeight > scroller.clientHeight - FOCUS_PAD_PX)
        scroller.scrollBy({
          top: y + item.offsetHeight - scroller.clientHeight + FOCUS_PAD_PX,
          behavior: 'smooth',
        });
…
    scroller?.scrollBy({ top: direction * (scroller.clientHeight - ROW_PX * 2), behavior: 'smooth' });
```

## Target

With reduced motion on:

| Surface | Behaviour |
|---|---|
| Sheet (tap open/close) | Fades in place: opacity 0 → 1 over **200ms** with `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`). No slide. On close, it fades out over 200ms, then moves off-screen instantly. |
| Sheet (drag and release) | Unchanged. A drag follows the finger (direct manipulation is fine), and the release uses `motion.ts`'s reduced spring. The sheet stays fully opaque while `data-dragging` or `data-settling` is set. |
| Backdrop | Fades over 200ms (0ms while gesture-owned). |
| Screen behind the sheet | Doesn't shrink or round its corners. No transition. |
| Club focus (row ↔ card) | Height changes instantly. The row/card opacity crossfade stays. |
| Build-your-stack entrance (`stack-card-in`, `stack-fan-in`) | Opacity-only, 200ms `--ease-out`, no delay. |
| Picker count bump | Opacity-only (0.4 → 1, 320ms as today). |
| Picker check badge | Fades in. No scale and no overshoot. |
| Wide page swap | The new page fades in without rising 8px. |
| Smooth scrolls in the club list | Instant (`behavior: 'auto'`). |
| Everything else | Today's transitions stay: press feedback, colour changes, edge fades, ripple, lens fades. |

## Repo conventions to follow

- State overrides go **inside the same `css()` object** as the base rule. Remix gives each class its own cascade layer, so a separate mixin can lose regardless of specificity (see the `standings-sheet.tsx:128-138` exemplar, which already does this for its close button):

  ```ts
  // app/actions/public/standings/standings-sheet.tsx:128-138 — exemplar
    transition: `transform ${v('--duration-press')} ${v('--ease-out')}`,

    '&:active': {
      transform: 'scale(0.9)',
    },

    '@media (prefers-reduced-motion: reduce)': {
      '&:active': {
        transform: 'none',
      },
    },
  ```
- Values come from tokens: `v('--ease-out')`. Use `200ms` as written here; it's the AUDIT fade duration, not a new token.
- JS checks use one helper, `prefersReducedMotion` from `app/actions/public/motion.ts`.

## Steps

1. **`app/actions/public/motion.ts`**: if `prefersReducedMotion` isn't exported yet (plan 000 adds it), add `export const prefersReducedMotion = reduced;` below `const reduced = …` (line 8).
2. **`app/actions/document.tsx:101-106`**: delete the whole `'@media (prefers-reduced-motion: reduce)'` block.
3. **`app/actions/public/sheet.tsx`, render**: add two variables to the root `<div>`'s `style`, next to `'--sheet-duration'`:

   ```ts
          '--sheet-fade': gestureOwned ? '0ms' : '200ms',
          '--sheet-hide-delay': open ? '0ms' : '200ms',
   ```
4. **`sheet.tsx`, `backdrop` css**: add

   ```ts
  '@media (prefers-reduced-motion: reduce)': {
    transitionDuration: 'var(--sheet-fade)',
  },
   ```
5. **`sheet.tsx`, `sheetContainer` css**: add after `willChange`

   ```ts
  // Reduced motion: the sheet fades in place instead of sliding. A drag still follows the finger.
  '@media (prefers-reduced-motion: reduce)': {
    opacity: 'var(--sheet-open)',
    transitionProperty: 'opacity, transform',
    transitionDuration: 'var(--sheet-fade), 0ms',
    transitionTimingFunction: `${v('--ease-out')}, linear`,
    transitionDelay: '0ms, var(--sheet-hide-delay)',

    '&[data-dragging], &[data-settling]': {
      opacity: 1,
    },
  },
   ```

   Keep the existing `[WIDE_QUERY]` block where it is. The inline `transitionDuration: '0ms'` used while gesture-owned still overrides both durations.
6. **`sheet.tsx`, `screenStyles` css**: add

   ```ts
  '@media (prefers-reduced-motion: reduce)': {
    transform: 'none',
    borderRadius: 0,
    transition: 'none',
  },
   ```
7. **`app/actions/public/clubs/club-list.tsx`**:
   - In `itemStyles` (line 291), add `'@media (prefers-reduced-motion: reduce)': { transition: 'none' },`.
   - Import `prefersReducedMotion` from `'../motion.ts'`.
   - In the three `scrollBy` calls (lines 89, 91-94, 121), replace `behavior: 'smooth'` with `behavior: prefersReducedMotion() ? 'auto' : 'smooth'`.
8. **`app/actions/public/clubs/build-your-stack.tsx`**:
   - `cardStyles` (line 69): add the keyframes `'@keyframes stack-card-fade': { from: { opacity: 0 } },` next to `stack-card-in`, and

     ```ts
  '@media (prefers-reduced-motion: reduce)': {
    animation: `stack-card-fade 200ms ${v('--ease-out')} backwards`,
  },
     ```
   - `miniCardStyles` (line 98): add the keyframes `'@keyframes stack-fan-fade': { from: { opacity: 0 } },` and

     ```ts
  '@media (prefers-reduced-motion: reduce)': {
    animation: `stack-fan-fade 200ms ${v('--ease-out')} backwards`,
    animationDelay: '0ms',
  },
     ```

     The resting fan transform (rotation and offset per `--k`) stays. It's a pose, not motion.
9. **`app/actions/public/clubs/club-picker.tsx`**:
   - Delete the local `const reducedMotion = …` (line 32) and import `prefersReducedMotion` from `'../motion.ts'`. Replace all four `reducedMotion()` calls (lines 82, 124, 189, 201) with `prefersReducedMotion()`.
   - `bumpStyles` (line 437): add the keyframes `'@keyframes picker-count-fade': { from: { opacity: 0.4 } },` and `'@media (prefers-reduced-motion: reduce)': { animationName: 'picker-count-fade' },`.
   - `checkStyles` (line 655): add

     ```ts
  '@media (prefers-reduced-motion: reduce)': {
    transform: 'none',

    '[aria-pressed="true"] > &': {
      transition: `opacity 160ms ${v('--ease-out')} 120ms`,
    },
  },
     ```
10. **`app/actions/public/wide/wide-home.tsx`**, `pageStyles` (line 501): add `'@media (prefers-reduced-motion: reduce)': { '&[data-enter]': { transform: 'none' } },`.
11. **`app/actions/public/wide/flow.ts:38`**: replace `matchMedia('(prefers-reduced-motion: reduce)').matches` with `prefersReducedMotion()`, importing it from `'../motion.ts'`.
12. **`app/actions/public/sheet.test.browser.tsx`**: the duration checks (lines 85-88, 125-128 and 303-306 at `b9c6ba9`; they shift after 002, so find them by searching for `prefers-reduced-motion` in the file) expect `'0s'` for every layer under reduced motion. Replace each of those three blocks with a call to a new helper:

    ```ts
    function assertDurations(layers: { screen: HTMLElement; sheet: HTMLElement; overlay: HTMLElement }, normal: string) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      assert.equal(getComputedStyle(layers.screen).transitionDuration, reduced ? '0s' : normal);
      assert.equal(getComputedStyle(layers.sheet).transitionDuration, reduced ? '0.2s, 0s' : normal);
      assert.equal(getComputedStyle(layers.overlay).transitionDuration, reduced ? '0.2s' : normal);
    }
    ```

    Call it with `'0.48s'`, `'0.34s'` and `'0.48s'` respectively. The suite runs without reduced motion, so default-mode results don't change.

## Boundaries

- Do NOT change any non-reduced motion. Every edit sits inside a `prefers-reduced-motion: reduce` block or a `prefersReducedMotion()` branch.
- Do NOT change `REDUCED_SPRING` or anything else in `motion.ts` beyond Step 1.
- Do NOT remove press feedback under reduced motion (the 0.94–0.985 scales). It's a 120–140ms response to the user's own touch, not motion through space. The only exception is the standings close button, which already opts out.
- Do NOT re-add a global `!important` rule.
- If quoted code doesn't match (drift since `b9c6ba9`, or since 002 landed), STOP and report.

## Verification

- **Mechanical**: `bun run typecheck` and `bun test` pass.
- **Feel check**: in Chrome DevTools, Rendering → *Emulate CSS prefers-reduced-motion: reduce*. On iPhone, Settings → Accessibility → Motion → Reduce Motion.
  - Tap a competition tile. The sheet fades up in place over about 200ms and the screen behind doesn't shrink. Close it: it fades out and nothing slides.
  - Drag the sheet header down. It follows your finger at full opacity, and on release it lands quickly without fading mid-drag.
  - Tap a club row. The card swaps in with a crossfade and the height changes instantly.
  - The picker: tapping a club shows the ripple and the check fades in without popping. The crest flight is skipped, as today.
  - Wide layout: picking a sidebar item crossfades the page in place.
  - Turn the setting off again. Everything matches `main`.
- **Before/after**: plan 001 with `--reduced`, `sheet-tap-open` on `main` vs this branch.
  - Before: `opacity` is constant and `y` is a single-frame jump (`first-frame jump` ≈ the sheet's height).
  - After: `y` still jumps (no slide), but `opacity` rises from 0 to 1 over about 200ms, and `screen` `sx` stays 1.
- **Done when**: under reduced motion nothing slides or scales across the screen, the fades remain, and the default mode is unchanged.
