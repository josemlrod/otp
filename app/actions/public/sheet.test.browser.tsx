import * as assert from 'remix/assert';
import { on } from 'remix/component';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';
import { tokens } from '../../ui/theme.ts';
import { Sheet, SheetController, sheetGrab } from './sheet.tsx';
import { rubber } from './motion.ts';

function mount() {
  const controller = new SheetController();
  const titleId = 'bare-sheet-title';
  function show(opener: HTMLElement) {
    controller.show({
      opener,
      labelledBy: titleId,
      content: () => (
        <>
          <header data-sheet-grab mix={sheetGrab}>
            <b id={titleId}>Placeholder</b>
            <button aria-label="Close" data-sheet-autofocus mix={on('click', controller.close)}>
              Close
            </button>
          </header>
          <div tabIndex={0} style={{ overflowY: 'auto' }}>Placeholder content</div>
        </>
      ),
    });
  }

  const view = render(
    <Sheet controller={controller} focusFallback={() => view.$('[data-fallback]')}>
      <button mix={on('click', (event) => show(event.currentTarget))}>Open</button>
      <button data-fallback>Fallback</button>
    </Sheet>,
  );
  for (const [token, value] of Object.entries(tokens)) view.container.style.setProperty(token, value);
  const tile = view.$('main button')!;
  const screen = view.$('main')!;
  const sheet = view.$('[role="dialog"]')!;
  const overlay = view.$('[aria-label="Close sheet"]')!;
  return { ...view, tile, screen, sheet, overlay, controller };
}

function finishTransitions(element: HTMLElement) {
  for (const animation of element.getAnimations()) animation.finish();
}
function opacityOf(element: HTMLElement) {
  finishTransitions(element);
  return Number(getComputedStyle(element).opacity);
}
function pullOf(sheet: HTMLElement) {
  return sheet.parentElement!.style.getPropertyValue('--sheet-pull');
}
async function nextFrame() {
  await new Promise(requestAnimationFrame);
}
describe('sheet', () => {
  it('opens separate layers and focuses the named dialog', async (t) => {
    const { $, act, cleanup, tile, screen, sheet, overlay } = mount();
    t.after(cleanup);

    assert.equal(sheet.inert, true);
    assert.equal(overlay.inert, true);
    assert.equal(screen.inert, false);
    assert.equal(screen.contains(sheet), false);
    assert.equal(screen.parentElement?.clientHeight, window.innerHeight);

    await act(() => tile.click());

    const closeButton = $('[aria-label="Close"]');
    assert.equal(document.activeElement, closeButton);
    assert.equal(sheet.inert, false);
    assert.equal(sheet.getAttribute('aria-hidden'), 'false');
    assert.equal(screen.inert, true);
    assert.equal(overlay.inert, false);
    assertNear(scaleOf(screen), 0.93);
    assertNear(radiusOf(screen), 1);
    assert.equal(sheet.style.transform, 'translateY(0px)');
    assert.equal(opacityOf(overlay), 0.45);
    assert.equal(overlay.style.pointerEvents, 'auto');

    const title = document.getElementById(sheet.getAttribute('aria-labelledby')!);
    assert.equal(title?.textContent, 'Placeholder');

    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '0.48s';
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(getComputedStyle(layer).transitionDuration, duration);
    }
  });

  for (const method of ['close button', 'overlay', 'Escape']) {
    it(`closes using ${method} and returns focus without clearing content`, async (t) => {
      const { $, act, cleanup, tile, screen, sheet, overlay } = mount();
      t.after(cleanup);

      await act(() => tile.click());
      const closeButton = $('[aria-label="Close"]');
      assert.ok(closeButton);

      await act(() => {
        if (method === 'close button') closeButton.click();
        if (method === 'overlay') overlay.click();
        if (method === 'Escape') {
          closeButton.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      });

      assert.equal(document.activeElement, tile);
      assert.equal(sheet.inert, true);
      assert.equal(sheet.getAttribute('aria-hidden'), 'true');
      assert.equal(screen.inert, false);
      assert.equal(scaleOf(screen), 1);
      assert.equal(radiusOf(screen), 0);
      assert.equal(overlay.inert, true);
      assert.equal(overlay.style.pointerEvents, 'none');
      assert.equal(opacityOf(overlay), 0);
      assert.match(sheet.textContent!, /Placeholder content/);

      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '0.34s';
      for (const layer of [screen, sheet, overlay]) {
        assert.equal(getComputedStyle(layer).transitionDuration, duration);
      }
    });
  }

  it('wraps Tab and Shift+Tab while leaving content keyboard-scrollable', async (t) => {
    const { $, act, cleanup, tile } = mount();
    t.after(cleanup);
    await act(() => tile.click());

    const closeButton = $('[aria-label="Close"]');
    const scroll = $('[role="dialog"] [tabindex="0"]');
    assert.ok(closeButton && scroll);
    assert.equal(getComputedStyle(scroll).overflowY, 'auto');

    const backwards = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    closeButton.dispatchEvent(backwards);
    assert.equal(backwards.defaultPrevented, true);
    assert.equal(document.activeElement, scroll);

    const forwards = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    scroll.dispatchEvent(forwards);
    assert.equal(forwards.defaultPrevented, true);
    assert.equal(document.activeElement, closeButton);

    const withinSheet = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    closeButton.dispatchEvent(withinSheet);
    assert.equal(withinSheet.defaultPrevented, false);

    const sheet = $('[role="dialog"]');
    assert.ok(sheet);
    sheet.focus();
    assert.equal(document.activeElement, sheet);
    const backwardsFromSheet = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    sheet.dispatchEvent(backwardsFromSheet);
    assert.equal(document.activeElement, scroll);
  });

  it('keeps focus in the sheet when close and reopen updates happen together', async (t) => {
    const { $, act, cleanup, tile, sheet } = mount();
    t.after(cleanup);
    await act(() => tile.click());

    await act(() => {
      $('[aria-label="Close"]')?.click();
      tile.click();
    });

    assert.equal(sheet.inert, false);
    assert.equal(document.activeElement, $('[aria-label="Close"]'));
  });
});

function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientY: number,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientY,
    }),
  );
}

function waitForFlickToFade() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

function scaleOf(element: HTMLElement) {
  finishTransitions(element);
  return new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
}
function radiusOf(element: HTMLElement) {
  finishTransitions(element);
  const radius = parseFloat(tokens['--radius-lg']) *
    parseFloat(getComputedStyle(document.documentElement).fontSize);
  return parseFloat(getComputedStyle(element).borderTopLeftRadius) / radius;
}

function assertNear(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-3, `expected ${actual} to be near ${expected}`);
}

describe('sheet drag', () => {
  async function openSheet() {
    const view = mount();
    await view.act(() => view.tile.click());
    const title = view.$('[role="dialog"] b[id]');
    assert.ok(title);
    const closedPullDown = view.sheet.offsetHeight + 30;
    return { ...view, title, closedPullDown };
  }

  it('moves the sheet and the layers behind it, resisting pulls above the top', async (t) => {
    const { act, cleanup, title, closedPullDown, screen, sheet, overlay } = await openSheet();
    t.after(cleanup);

    await act(() => pointer(title, 'pointerdown', 100));
    await act(() => pointer(title, 'pointermove', 200));
    await nextFrame();

    const openFraction = 1 - 100 / closedPullDown;
    assert.equal(pullOf(sheet), '100px');
    assertNear(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42, 100);
    assertNear(scaleOf(screen), 1 - openFraction * 0.07);
    assertNear(radiusOf(screen), openFraction);
    assertNear(opacityOf(overlay), openFraction * 0.45);
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(getComputedStyle(layer).transitionDuration, '0s');
    }
    assert.equal(getComputedStyle(sheet.querySelector('[data-sheet-grab]')!).cursor, 'grabbing');

    await act(() => pointer(title, 'pointermove', 0));
    await nextFrame();
    assert.equal(pullOf(sheet), `${rubber(-100, closedPullDown, 0.2)}px`);
    assertNear(scaleOf(screen), 0.93);
  });

  it('ignores movement under the threshold and presses on the close button', async (t) => {
    const { $, act, cleanup, title, screen, sheet } = await openSheet();
    t.after(cleanup);

    await act(() => pointer(title, 'pointerdown', 100));
    await act(() => pointer(title, 'pointermove', 104));
    assert.equal(sheet.style.transform, 'translateY(0px)');
    await act(() => pointer(title, 'pointerup', 104));

    const closeButton = $('[aria-label="Close"]');
    assert.ok(closeButton);
    await act(() => pointer(closeButton, 'pointerdown', 100));
    await act(() => pointer(closeButton, 'pointermove', 300));
    assert.equal(sheet.style.transform, 'translateY(0px)');
    assertNear(scaleOf(screen), 0.93);
  });

  it('snaps back open before halfway and closes past it', async (t) => {
    const { act, cleanup, tile, title, closedPullDown, screen, sheet, overlay } = await openSheet();
    t.after(cleanup);

    async function dragAndRelease(distance: number) {
      await act(() => pointer(title, 'pointerdown', 100));
      await act(() => pointer(title, 'pointermove', 100 + distance));
      await waitForFlickToFade();
      await act(() => pointer(title, 'pointerup', 100 + distance));
    }

    await dragAndRelease(closedPullDown / 2 - 20);
    assert.equal(sheet.inert, false);
    assert.equal(sheet.style.transform, 'translateY(0px)');
    assertNear(scaleOf(screen), 0.93);
    assertNear(radiusOf(screen), 1);
    assert.equal(opacityOf(overlay), 0.45);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '0.48s';
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(getComputedStyle(layer).transitionDuration, duration);
    }

    await dragAndRelease(closedPullDown / 2 + 20);
    assert.equal(sheet.inert, true);
    assert.equal(sheet.style.transform, 'translateY(110%)');
    assert.equal(scaleOf(screen), 1);
    assert.equal(document.activeElement, tile);
  });

  it('closes on a quick downward flick even when it is short', async (t) => {
    const { act, cleanup, tile, title, sheet } = await openSheet();
    t.after(cleanup);

    await act(() => pointer(title, 'pointerdown', 100));
    await act(() => pointer(title, 'pointermove', 120));
    await act(() => pointer(title, 'pointermove', 180));
    await act(() => pointer(title, 'pointerup', 180));

    assert.equal(sheet.inert, true);
    assert.equal(document.activeElement, tile);
  });
});

describe('sheet lifecycle', () => {
  it('uses the caller fallback when the opener is disconnected', async (t) => {
    const { $, tile, act, cleanup } = mount();
    t.after(cleanup);
    await act(() => tile.click());
    tile.remove();
    await act(() => $('[aria-label="Close"]')!.click());
    assert.equal(document.activeElement, $('[data-fallback]'));
  });

  it('calls the close hook once and preserves content for the closing transition', async (t) => {
    const { tile, controller, sheet, act, cleanup } = mount();
    t.after(cleanup);
    let closes = 0;
    await act(() =>
      controller.show({
        opener: tile,
        content: () => <p>Saved content</p>,
        onClose: () => {
          closes++;
        },
      }),
    );
    assert.equal(document.activeElement, sheet, 'focuses the sheet if content has no autofocus');
    await act(() => { controller.close(); controller.close(); });
    assert.equal(closes, 1);
    assert.match(sheet.textContent!, /Saved content/);
  });
});
