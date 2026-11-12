# 004 — Fly the picked crest along a smooth arc (only if slow motion shows the kink)

- **Status**: TODO (gated: Step 0 decides)
- **Commit**: b9c6ba9
- **Severity**: LOW
- **Category**: Physicality
- **Estimated scope**: 1 file, ~20 lines
- **Depends on**: 000 and 001, for the Step 0 check

## Problem

When you pick a club, a clone of its crest flies from the tile into the tray (`app/actions/public/clubs/club-picker.tsx:123-164`). The "arc" is three keyframes, so the path is two straight lines meeting at offset 0.45. One easing curve covers the whole flight, and segments in between are linear.

```ts
// app/actions/public/clubs/club-picker.tsx:145-156 — current
    ghost
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)' },
          {
            transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(${(1 + scale) / 2 + 0.08})`,
            offset: 0.45,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        ],
        { duration: FLY_MS, easing: EASE_IOS },
      )
```

At the 0.45 corner, the speed along the path drops by about a third. The first segment covers 50% of the distance in 45% of the progress; the second covers the rest in 55%. The rate of shrinking also jumps by about 2.6×. On a typical flight from the grid up to the tray, the direction only bends by about 4°, so the speed change is what might be visible, as a small lurch at the apex.

**This is a calculation from the code; nobody has seen it yet.** At 520ms it may not show at all. That's why Step 0 comes first.

## Step 0 — decide with the lab (required)

1. Pinned scenario (`README.md:63`), plan 001: `bun run motion:capture --url <main> --label before --interaction picker-fly --scale 0.1`.
2. Open the trace's `ghost` target and look at the `ty` velocity (in the lab panel: paste the trace, or pick the ghost live at ⅒×).
3. **Proceed only if** the velocity curve has a step change of 25% or more within one or two frames near the middle of the flight, **and** a lurch is visible in the ⅒× video. Otherwise set **Status: NO-CHANGE**, add the two observations to this file, and stop.

## Target

Same duration (`FLY_MS = 520`), same curve (`EASE_IOS = cubic-bezier(0.32, 0.72, 0, 1)`), same 18px bow and same +0.08 swell at the middle. Sample the arc densely enough that the path is smooth: 25 keyframes, linearly interpolated, with the eased progress moving along them.

```ts
// app/actions/public/clubs/club-picker.tsx — add below CHIP_EXIT_MS (line 22)
const FLY_LIFT_PX = 18; // how far the path bows above the straight line, at its middle
const FLY_SWELL = 0.08; // how much larger than the straight-line scale the crest is mid-flight
const FLY_SAMPLES = 24;

// A parabola from the tile to the chip, sampled densely enough that the path has no corners.
// Offsets are eased progress, so EASE_IOS still sets the pace along it.
function flightKeyframes(dx: number, dy: number, scale: number): Keyframe[] {
  return Array.from({ length: FLY_SAMPLES + 1 }, (_, k) => {
    const p = k / FLY_SAMPLES;
    const bow = 4 * p * (1 - p); // 0 at both ends, 1 in the middle
    const x = dx * p;
    const y = dy * p - FLY_LIFT_PX * bow;
    const s = 1 + (scale - 1) * p + FLY_SWELL * bow;
    return { transform: `translate(${x}px, ${y}px) scale(${s})`, offset: p };
  });
}
```

```ts
// club-picker.tsx:145-156 — target
    ghost
      .animate(flightKeyframes(dx, dy, scale), { duration: FLY_MS, easing: EASE_IOS })
```

Leave everything else in `fly()` unchanged: the ghost setup, hiding the target chip for `FLY_MS`, and the 260ms landing pop.

## Repo conventions to follow

- Constants sit at the top of the file in SCREAMING_CASE with a short comment (`club-picker.tsx:19-24`).
- WAAPI stays WAAPI. Don't move this to a rAF loop: WAAPI keeps it off the main thread's critical path, and the lab can slow it.

## Boundaries

- Do NOT change `FLY_MS`, `EASE_IOS`, the landing pop or the chip exit.
- Do NOT touch reduced-motion handling (`fly` already returns early).
- If Step 0 says no, change no code.

## Verification

- **Mechanical**: `bun run typecheck` and `bun test` pass. The picker tests in `home-screen.test.browser.tsx` should pass unchanged.
- **Feel check**: `/?motion=0.1`, then open the picker and tap clubs from different rows and columns.
  - The crest follows one smooth curve with no visible corner or change of pace mid-flight.
  - It still reads as rising slightly and swelling before shrinking into the chip.
  - Real speed: it feels the same as before, minus the lurch.
- **Before/after**: plan 001 `picker-fly --scale 0.1` on `main` vs this branch. The `ghost` `ty` velocity curve is smooth after, `max frame delta` shrinks, and `durationMs` is the same (±1 frame).
- **Done when**: Step 0's observation is written here, and either the change is in with a smooth velocity curve, or the plan is marked NO-CHANGE.
