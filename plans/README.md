# Animation plans

From the motion audit at `b9c6ba9` (2026-11-12). Each plan stands alone and can be handed to an executor that has no context.

| # | Plan | Severity | Status | Depends on |
|---|---|---|---|---|
| 000 | [Motion lab: slow motion, pause, frame step, per-element trace](000-motion-lab.md) | Tooling | DONE | — |
| 001 | [Before/after capture harness](001-before-after-capture.md) | Tooling | DONE | 000 |
| 002 | [Sheet release on springs, catchable mid-rise](002-sheet-release-on-springs.md) | HIGH | TODO | 000, 001 (for proof) |
| 003 | [Reduced motion: fade instead of move](003-reduced-motion-fades-not-nothing.md) | MEDIUM | TODO | 002 |
| 004 | [Picker crest flies a smooth arc](004-picker-fly-true-arc.md) | LOW | TODO (gated) | 000, 001 |
| 005 | [Wide page swap without double exposure](005-wide-page-swap-double-exposure.md) | LOW | TODO (gated) | 000, 001 |

## Order

1. **000 → 001, merged to `main` first.** Every later "before" capture is taken from `main`, so `main` needs the lab before any fix branches off it.
2. **002**: the highest-impact fix.
3. **003**: builds on 002's sheet render (`gestureOwned`, `data-settling`).
4. **004 and 005**: each starts with a Step 0 that measures the problem in slow motion. If it isn't visible, the plan closes as NO-CHANGE with the numbers written in.

## Before/after for every fix

For each fix plan:

1. Serve `main` and the fix branch side by side on the pinned scenario (`OTP_SCENARIO=matchday OTP_NOW=2026-11-08T14:55:00Z OTP_TZ=Europe/London`, ports 44101 and 44102).
2. Run that plan's interactions with `bun run motion:capture` (`--label before` / `--label after`).
3. Run `bun run motion:report --interaction <name>`.

The report puts both slow-motion videos side by side and overlays the measured curves, with duration, peak speed, overshoot, first-frame jump and largest single-frame change. Each plan's **Before/after** section lists its interactions and the numbers it should move.

## Not planned (from the audit)

- Hand-typed curves duplicating tokens: `club-picker.tsx:23-24`, `wide/flow.ts:11`, and the plain `ease-out` keyword at `club-picker.tsx:627,637,668,679`.
- The skeleton pulse uses ease-out instead of ease-in-out (`club-card.tsx:566`, `wide/club-page.tsx:474`).
- The club focus animates `height` (`club-list.tsx:79,300`). It was ported one-to-one from the prototype on purpose. Measure it with the perf HUD at 4× CPU slowdown before touching it.
- Missed opportunities: a fade when a club's matches first load (not on refresh); the standings tile → sheet origin; a first-run stagger after picking clubs.
- Deliberately left alone: the sheet drag's `--sheet-drag` variable on the root. Remix diffs `style` against the vnode, so the design writes CSS variables, not `transform`.
