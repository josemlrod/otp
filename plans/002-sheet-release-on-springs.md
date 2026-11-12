# 002 — Put the sheet's release on the spring engine, and let it be caught mid-rise

- **Status**: TODO
- **Commit**: b9c6ba9
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: `app/actions/public/sheet.tsx` (~80 lines changed), `sheet.test.browser.tsx` (+4 tests, 2 updated), `home-screen.test.browser.tsx` (1 test updated)
- **Depends on**: 000 (for the feel check) and 001 (for the before/after). The code change itself doesn't need them.

## Problem

The sheet (standings and the club picker) is OTP's most-dragged surface. Two things break the feeling that it's a physical object.

**1. Grabbing it while it rises makes it jump.** A tap opens the sheet with a 480ms CSS transition. If the finger lands on the header during that rise, the drag starts at `pullDownPx = travelPx`, measured from where the finger landed, and ignores where the sheet actually is. The moment the drag claims (6px), the render switches to `translateY(var(--sheet-pull))` with `transitionDuration: '0ms'`, and the sheet teleports to nearly fully open. The screen behind jumps too, because `--sheet-drag` is written as about 1.

```ts
// app/actions/public/sheet.tsx:159-187 — current
  function startPress(event: SheetPointerEvent) {
    if (!controller.open) return;
    if (event.button > 0 || !event.isPrimary) return;
    if (!canStartDrag(event.target)) return;
    velocity.reset(0, event.clientY, event.timeStamp);
    press = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastTimeStamp: event.timeStamp,
      isDragging: false,
      openFraction: 1,
    };
  }

  function movePress(event: SheetPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const travelPx = event.clientY - press.startY;
    if (!press.isDragging) {
      if (Math.abs(travelPx) < MIN_DRAG_DISTANCE_PX) return;
      press.isDragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      handle.update();
    }
    velocity.add(0, event.clientY, event.timeStamp);
    press.lastTimeStamp = event.timeStamp;
    pullDownPx = travelPx;
    press.openFraction = clamp(1 - pullDownPx / closedPullDownPx(), 0, 1);
    if (!frame) frame = requestAnimationFrame(paintDrag);
  }
```

**2. The release ignores the finger's speed.** On release, the sheet hands back to fixed CSS transitions. A short pull that falls back always takes 480ms (`--duration-sheet-open`), and a fast flick to close always takes 340ms (`--duration-sheet-close`), whatever speed the finger had. The speed is only used to choose open or closed, never to move.

```ts
// app/actions/public/sheet.tsx:189-210 — current
  function endPress(event: SheetPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { isDragging, lastTimeStamp } = press;
    const velocityPxPerMs = velocity.velocity(lastTimeStamp).y / 1000;
    press = null;
    if (!isDragging) return;

    cancelPaint();
    const fingerWasStill =
      event.timeStamp - lastTimeStamp > STILL_FINGER_LOSES_FLICK_AFTER_MS;
    const flickVelocity = fingerWasStill ? 0 : velocityPxPerMs;
    const projectedPullDownPx = pullDownPx + flickVelocity * FLICK_PROJECTION_MS;
    pullDownPx = 0;

    if (projectedPullDownPx > closedPullDownPx() / 2) {
      controller.close();
    } else {
      handle.update().then((signal) => {
        if (!signal.aborted && !press?.isDragging) clearDrag();
      });
    }
  }
```

`docs/adr/0003-hand-rolled-springs.md:7` already records this: *"The sheet's drag still has its own rubber band and velocity code, and that is debt to fold in, not a precedent."* The timeline pager (`app/actions/public/clubs/timeline.ts:256-307`) and the wide slide-over (`app/actions/public/wide/wide-home.tsx:145-220`) already do this correctly.

## Target

- **Tap open and tap close are unchanged.** They keep the CSS transitions: 480ms and 340ms on `--ease-ios` (`cubic-bezier(0.32, 0.72, 0, 1)`). Predetermined motion stays in CSS.
- **During a drag, nothing changes visibly.** It still writes `--sheet-pull` and `--sheet-drag` on the root once per frame, with the same rubber band above the top (`rubber(px, closedPullDownPx(), 0.2)`).
- **On release**, one `Value` (from `motion.ts`) owns the sheet's pull, in px, and springs it to its resting place, starting **at the finger's speed**:
  - Falls short (the projected pull is ≤ half): spring to `0` with `SPRING.snap` (`{ stiffness: 760, damping: 55 }`).
  - Passes half: call `controller.close()` immediately (focus, `onClose` and `inert` behave as today), and spring to `closedPullDownPx()` with `SPRING.release` (`{ stiffness: 420, damping: 33 }`).
  - The spring's `onChange` writes the same two variables the drag writes, so the screen behind and the backdrop follow it exactly.
  - When the spring settles, hand back to the CSS resting state in the existing order: render first, so the durations are restored, then remove the variables.
- **Catching.** A press on the header while the sheet is moving claims at once, with no 6px threshold, and holds the sheet exactly where it is. This applies both to the CSS rise after a tap and to a release spring heading open.
  - If the finger then moves, it's a normal drag from that position.
  - If the finger lifts without moving (< 6px), the sheet finishes opening with `SPRING.snap`. This matches the pager's "caught and let go: finish where it was heading" (`timeline.ts:293-296`).
- A sheet that is closing can't be caught. That needs the controller to reopen, which is out of scope.
- `pointercancel` releases with zero velocity.
- While the release spring runs, the sheet carries `data-settling="open" | "closed"`, for tests and the motion lab.

### Target code

Replace the `import` from `./motion.ts` at `sheet.tsx:7`:

```ts
import { SPRING, Value, clamp, rubber, tracker, type Spring } from './motion.ts';
```

Replace the `GrabPress` type (`sheet.tsx:55-61`):

```ts
type GrabPress = {
  pointerId: number;
  startY: number;
  /** Where the sheet was when the finger landed: 0 is fully open. */
  startPullPx: number;
  lastTimeStamp: number;
  isDragging: boolean;
  /** Grabbed while moving: claimed at once, and a still release finishes opening. */
  caught: boolean;
  moved: boolean;
};
```

Inside `Sheet`, replace lines 111-157 (the state declarations through `closedPullDownPx`) with the block below. The focus-trap helpers above it are unchanged.

```ts
  let sheet: HTMLElement | undefined;
  let press: GrabPress | null = null;
  let pullDownPx = 0;
  let root: HTMLElement | undefined;
  let screen: HTMLElement | undefined;
  let frame = 0;
  /** Set while a release spring owns the sheet. */
  let releasing: 'open' | 'closed' | null = null;
  const velocity = tracker();
  const controller = handle.props.controller;

  const closedPullDownPx = () => (sheet?.offsetHeight ?? 0) + CLOSED_OVERSHOOT_PX;

  // The sheet's pull in px (0 = open). Drag and release both paint through it.
  const pull = new Value(0, (px) => {
    if (!root) return;
    const closed = closedPullDownPx();
    root.style.setProperty('--sheet-drag', String(clamp(1 - px / closed, 0, 1)));
    root.style.setProperty('--sheet-pull', `${px < 0 ? rubber(px, closed, 0.2) : px}px`);
  });

  function cancelPaint() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function clearDrag() {
    cancelPaint();
    root?.style.removeProperty('--sheet-drag');
    root?.style.removeProperty('--sheet-pull');
  }

  function stopRelease() {
    if (!releasing) return;
    releasing = null;
    pull.stop();
  }

  controller.addEventListener('change', async () => {
    // A close we started on release keeps its spring; anything else takes the sheet back.
    const ownClose = releasing === 'closed' && !controller.open;
    press = null;
    cancelPaint();
    if (!ownClose) stopRelease();
    const signal = await handle.update();
    if (signal.aborted) return;
    // Restore transition durations before removing the gesture's overrides.
    if (!ownClose) clearDrag();
    if (controller.open) {
      (sheet?.querySelector<HTMLElement>('[data-sheet-autofocus]') ?? sheet)
        ?.focus({ preventScroll: true });
    } else {
      const opener = controller.request?.opener;
      (opener?.isConnected ? opener : (screen && handle.props.focusFallback?.(screen)))
        ?.focus({ preventScroll: true });
    }
  }, { signal: handle.signal });
  handle.signal.addEventListener('abort', () => {
    pull.stop();
    clearDrag();
  }, { once: true });

  function paintDrag() {
    frame = 0;
    if (!press?.isDragging) return;
    pull.set(pullDownPx);
  }

  /** Where the sheet is if it's still moving (a release spring, or the CSS rise after a tap). */
  function catchPosition(): number | null {
    if (releasing === 'open') return pull.value;
    if (!sheet) return null;
    const rising = sheet
      .getAnimations()
      .some((animation) => animation.playState === 'running' || animation.playState === 'paused');
    if (!rising) return null;
    return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
  }

  function settle(to: 'open' | 'closed', velocityPxPerS: number, spring: Spring) {
    releasing = to;
    handle.update(); // drops data-dragging; the sheet stays gesture-owned until the spring lands
    pull
      .to(to === 'open' ? 0 : closedPullDownPx(), { velocity: velocityPxPerS, spring })
      .then(async (settled) => {
        if (!settled || releasing !== to) return; // caught, or the controller took over
        releasing = null;
        // Restore transition durations before removing the gesture's overrides.
        const signal = await handle.update();
        if (!signal.aborted && !press?.isDragging && !releasing) clearDrag();
      });
  }
```

Replace `startPress`, `movePress` and `endPress` (lines 159-210):

```ts
  function startPress(event: SheetPointerEvent) {
    if (!controller.open) return;
    if (event.button > 0 || !event.isPrimary) return;
    if (!canStartDrag(event.target)) return;
    const caughtPx = catchPosition();
    velocity.reset(0, event.clientY, event.timeStamp);
    press = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPullPx: caughtPx ?? 0,
      lastTimeStamp: event.timeStamp,
      isDragging: caughtPx !== null,
      caught: caughtPx !== null,
      moved: false,
    };
    if (caughtPx === null) return;
    // Caught mid-flight: hold it where it is, and own it from this frame.
    stopRelease();
    pullDownPx = caughtPx;
    pull.set(caughtPx);
    event.currentTarget.setPointerCapture(event.pointerId);
    handle.update();
  }

  function movePress(event: SheetPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const travelPx = event.clientY - press.startY;
    if (Math.abs(travelPx) >= MIN_DRAG_DISTANCE_PX) press.moved = true;
    if (!press.isDragging) {
      if (!press.moved) return;
      press.isDragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      handle.update();
    }
    velocity.add(0, event.clientY, event.timeStamp);
    press.lastTimeStamp = event.timeStamp;
    pullDownPx = press.startPullPx + travelPx;
    if (!frame) frame = requestAnimationFrame(paintDrag);
  }

  function endPress(event: SheetPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { isDragging, lastTimeStamp, caught, moved } = press;
    const releasePxPerS = event.type === 'pointerup' ? velocity.velocity(lastTimeStamp).y : 0;
    press = null;
    if (!isDragging) return;

    cancelPaint();
    pull.set(pullDownPx); // land the last move the frame hasn't painted yet
    const fingerWasStill =
      event.timeStamp - lastTimeStamp > STILL_FINGER_LOSES_FLICK_AFTER_MS;
    const flickPxPerS = fingerWasStill ? 0 : releasePxPerS;
    const projectedPullDownPx = pullDownPx + (flickPxPerS / 1000) * FLICK_PROJECTION_MS;
    pullDownPx = 0;

    if (caught && !moved) return settle('open', 0, SPRING.snap);
    if (projectedPullDownPx > closedPullDownPx() / 2) {
      settle('closed', flickPxPerS, SPRING.release);
      controller.close();
    } else {
      settle('open', flickPxPerS, SPRING.snap);
    }
  }
```

In the render function (lines 212-287), change only these parts:

```ts
    const isDragging = !!press?.isDragging;
    const gestureOwned = isDragging || releasing !== null;
```

- Replace both uses of `isDragging` in `'--sheet-duration'` (line 227) and the section `style` (lines 276-279) with `gestureOwned`.
- Keep `data-dragging={isDragging ? 'true' : undefined}`. It drives the grabbing cursor, which should end at release.
- Add `data-settling={releasing ?? undefined}` on the `<section>`, next to `data-dragging`.

Delete the `openFraction` field everywhere. Keep `BACKDROP_OPEN_OPACITY`, `MIN_DRAG_DISTANCE_PX`, `FLICK_PROJECTION_MS`, `STILL_FINGER_LOSES_FLICK_AFTER_MS` and `CLOSED_OVERSHOOT_PX` as they are. The open/closed decision deliberately stays the same.

Why it's written this way:

- **Variables, not `transform`.** Remix diffs `style` against the previous vnode, not the DOM, so a hand-written `transform` would get stuck. The spring writes the same CSS variables the drag already writes.
- **No re-render per frame.** `HomeScreen` must not re-render during the drag or the release; there is a render-count test for this.

## Repo conventions to follow

- Spring presets come only from `SPRING` in `app/actions/public/motion.ts:19-23`. Never write new stiffness or damping numbers.
- Exemplar of catch, release and finish-the-trip on the same engine: `app/actions/public/clubs/timeline.ts:256-307` (pager) and `app/actions/public/wide/wide-home.tsx:145-220` (slide-over).
- Keep comments short and explanatory in the file's existing voice. ADR 0003's debt line becomes untrue: in `docs/adr/0003-hand-rolled-springs.md:7`, change the second sentence to: *"The sheet's release and catch use it too; only its rubber band call is local."*

## Steps

1. Apply the import, the type, the state block, the three handlers and the render edits above to `app/actions/public/sheet.tsx`.
2. In `app/actions/public/sheet.test.browser.tsx`, add a helper next to `nextFrame`:

   ```ts
   async function settled(sheet: HTMLElement) {
     for (let i = 0; i < 240 && sheet.hasAttribute('data-settling'); i++) await nextFrame();
     assert.equal(sheet.hasAttribute('data-settling'), false, 'the release spring lands');
     await nextFrame();
     await new Promise((resolve) => setTimeout(resolve, 0));
   }
   function yOf(sheet: HTMLElement) {
     return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
   }
   ```

   **Settle the rise before existing drag tests.** A press during the 480ms rise now counts as a catch, and today's tests drag straight after `tile.click()`. Make them start from a settled sheet:
   - In `openSheet()` inside `describe('sheet drag')` (`sheet.test.browser.tsx:235-242`), add `for (const layer of [view.sheet, view.screen, view.overlay]) finishTransitions(layer);` right after `await view.act(() => view.tile.click());`.
   - In `home-screen.test.browser.tsx`, add `for (const animation of sheet.getAnimations()) animation.finish();` right after `await act(() => tile.click());` in the render-cost test (line 252). In the `saves picked clubs when drag closes the picker` test (line 179), add `for (const animation of $('[role="dialog"]')!.getAnimations()) animation.finish();` right after `await act(() => choose.click());`.

3. Update **"snaps back open before halfway and closes past it"** (`sheet.test.browser.tsx:286-313`). After each `dragAndRelease(...)` call, add `await settled(sheet);` before the assertions. The assertions themselves stay as they are.
4. Add these tests in `describe('sheet drag')`:
   - **"springs back from where the finger let go"**:
     - Open the sheet, then `pointerdown` at 100, `pointermove` at 300, `waitForFlickToFade()`, `pointerup` at 300.
     - Await `nextFrame()`. Assert `sheet.getAttribute('data-settling') === 'open'` and `yOf(sheet) > 100`: the sheet starts from the finger, not from rest.
     - `await settled(sheet)`, then assert `sheet.style.transform === 'translateY(0px)'` and `pullOf(sheet) === ''`.
   - **"a downward flick carries its speed into the close"**:
     - The same moves as the existing flick test (100 → 120 → 180, then up at 180).
     - Assert `sheet.inert === true` immediately, and `sheet.getAttribute('data-settling') === 'closed'`.
     - Await `nextFrame()` and assert `yOf(sheet) > 80`.
     - `await settled(sheet)`, then assert `sheet.style.transform === 'translateY(110%)'`.
   - **"catching the sheet while it rises holds it where it is"**:
     - If `matchMedia('(prefers-reduced-motion: reduce)').matches`, return early: there is no rise to catch. Put that reason in a comment.
     - `mount()`, then `await act(() => tile.click())`, and get the title with `$('[role="dialog"] b[id]')`. Pause the rise with `for (const a of sheet.getAnimations()) { a.pause(); a.currentTime = 150; }` and record `const y0 = yOf(sheet)`. Assert `y0 > 50`.
     - `pointerdown` on the title at 300, then `nextFrame()`. Assert `Math.abs(yOf(sheet) - y0) < 1`.
     - `pointermove` at 330, then `nextFrame()`. Assert `Math.abs(yOf(sheet) - (y0 + 30)) < 1`.
   - **"a still tap on a rising sheet lets it finish opening"**:
     - Same setup and the same early return as the previous test.
     - `pointerdown` at 300, then `pointerup` at 300. Assert `sheet.getAttribute('data-settling') === 'open'`.
     - `await settled(sheet)`, then assert `sheet.style.transform === 'translateY(0px)'` and `sheet.inert === false`.
5. In `app/actions/public/home-screen.test.browser.tsx`, the test **"does not render HomeScreen or Sheet on repeated drag moves"** (lines 249-275): after the `pointerup` at 160, keep `assert.equal(renderStats.counts.get('Sheet'), 2, 'renders at drag end')`, then:
   - Add `for (let i = 0; i < 240 && sheet.hasAttribute('data-settling'); i++) await new Promise(requestAnimationFrame); await new Promise((r) => setTimeout(r, 0));`.
   - Add `assert.equal(renderStats.counts.get('Sheet'), 3, 'renders once more when the spring lands');`.
   - Move the two `--sheet-drag` / `--sheet-pull` `''` assertions after that.
   - Add `assert.equal(renderStats.counts.get('HomeScreen') ?? 0, 0);` there too.
6. Edit ADR 0003 as described above.

## Boundaries

- Do NOT change tap-open or tap-close (`--duration-sheet-open`, `--duration-sheet-close`, `--ease-ios`, the `backdrop`, `sheetContainer` and `screenStyles` CSS).
- Do NOT change the open/closed decision rule (projection and half threshold), or the rubber constant `0.2`.
- Do NOT make a closing sheet catchable.
- Do NOT touch `motion.ts`.
- Do NOT write `transform` from JS. Use the CSS variables only.
- If any quoted code doesn't match (drift since `b9c6ba9`), STOP and report.

## Verification

- **Mechanical**: `bun run typecheck` and `bun test` pass, including the four new tests, the updated render-count test, and `saves picked clubs when drag closes the picker`, which should pass unchanged.
- **Feel check**: pinned scenario (see `README.md:63`), `/?motion=0.25`, lab target `[role=dialog]`.
  - Flick the sheet down hard. At release, the plot's `y` slope continues the finger's slope with no kink. Fast flicks close faster than slow ones.
  - Pull down about 100px, hold still, then let go. It returns with no overshoot (`SPRING.snap` is about critically damped), and the `over` stat is about 0.
  - Tap a tile and grab the header halfway up. The sheet stops under your finger, and the screen behind stops shrinking at the same moment. `jump` is about 0.
  - Grab it halfway up and let go without moving. It finishes opening.
  - Grab it while it's springing back open after a short pull. It stops under your finger.
  - Check on a real iPhone: the flick should feel like the timeline pager's.
- **Before/after**: run plan 001's `sheet-flick-close`, `sheet-short-pull` and `sheet-catch` on `main` (before) and this branch (after), then `bun run motion:report` for each. Expected:
  - `sheet-catch`: `first-frame jump` and `max frame delta` drop from tens to hundreds of px to under 2px.
  - `sheet-short-pull`: duration drops from about 480ms to about 300ms.
  - `sheet-flick-close`: the start of the curve follows the release speed.
- **Done when**: all of the above hold, and HomeScreen renders 0 times from drag start to spring landing.
