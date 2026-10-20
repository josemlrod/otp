import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import type { StandingsResponse } from '../../lib/types/api.ts';
import { tokens } from '../../ui/theme.ts';
import { HomeScreen } from './home-screen.tsx';

const standing: StandingsResponse = {
  filters: { season: '2026' },
  area: { id: 2072, name: 'England', code: 'ENG', flag: '' },
  competition: {
    id: 2021,
    name: 'Premier League',
    code: 'PL',
    type: 'LEAGUE',
    emblem: '',
  },
  season: {
    id: 2502,
    startDate: '2026-08-21',
    endDate: '2027-05-30',
    currentMatchday: 7,
    winner: null,
  },
  standings: [{ stage: 'REGULAR_SEASON', type: 'TOTAL', group: 'Matchday', table: [] }],
};

const otherStanding: StandingsResponse = {
  ...standing,
  competition: { ...standing.competition, id: 2014, name: 'La Liga', code: 'PD' },
};

function mount() {
  const view = render(<HomeScreen standings={[standing, otherStanding]} />);
  view.container.style.cssText = 'height: 600px; width: 390px;';
  for (const [token, value] of Object.entries(tokens)) {
    view.container.style.setProperty(token, value);
  }

  const tile = view.$('main button');
  const screen = view.$('main');
  const sheet = view.$('[role="dialog"]');
  const overlay = view.$('[aria-label="Close standings"]');
  assert.ok(tile && screen && sheet && overlay);

  return { ...view, tile, screen, sheet, overlay };
}

describe('home screen standings sheet', () => {
  it('opens separate layers and focuses the named dialog', async (t) => {
    const { $, act, cleanup, tile, screen, sheet, overlay } = mount();
    t.after(cleanup);

    assert.equal(sheet.inert, true);
    assert.equal(overlay.inert, true);
    assert.equal(screen.inert, false);
    assert.equal(screen.contains(sheet), false);
    assert.equal(screen.parentElement?.clientHeight, 600);

    await act(() => tile.click());

    const closeButton = $('[aria-label="Close"]');
    assert.equal(document.activeElement, closeButton);
    assert.equal(sheet.inert, false);
    assert.equal(sheet.getAttribute('aria-hidden'), 'false');
    assert.equal(screen.inert, true);
    assert.equal(overlay.inert, false);
    assert.equal(screen.style.transform, 'scale(0.93)');
    assert.equal(radiusOf(screen), 1);
    assert.equal(sheet.style.transform, 'translateY(0px)');
    assert.equal(overlay.style.opacity, '0.45');
    assert.equal(overlay.style.pointerEvents, 'auto');

    const title = document.getElementById(sheet.getAttribute('aria-labelledby')!);
    assert.equal(title?.textContent, 'Premier League');

    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? '0s'
      : '0.48s';
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
          closeButton.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true, cancelable: true,
          }));
        }
      });

      assert.equal(document.activeElement, tile);
      assert.equal(sheet.inert, true);
      assert.equal(sheet.getAttribute('aria-hidden'), 'true');
      assert.equal(screen.inert, false);
      assert.equal(screen.style.transform, 'scale(1)');
      assert.equal(radiusOf(screen), 0);
      assert.equal(overlay.inert, true);
      assert.equal(overlay.style.pointerEvents, 'none');
      assert.equal(overlay.style.opacity, '0');
      assert.ok(sheet.querySelector('table'));

      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
        ? '0s'
        : '0.34s';
      for (const layer of [screen, sheet, overlay]) {
        assert.equal(getComputedStyle(layer).transitionDuration, duration);
      }
    });
  }

  it('wraps Tab and Shift+Tab while leaving the table keyboard-scrollable', async (t) => {
    const { $, act, cleanup, tile } = mount();
    t.after(cleanup);
    await act(() => tile.click());

    const closeButton = $('[aria-label="Close"]');
    const scroll = $('[role="dialog"] [tabindex="0"]');
    assert.ok(closeButton && scroll);
    assert.equal(getComputedStyle(scroll).overflowY, 'auto');

    const backwards = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    closeButton.dispatchEvent(backwards);
    assert.equal(backwards.defaultPrevented, true);
    assert.equal(document.activeElement, scroll);

    const forwards = new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    });
    scroll.dispatchEvent(forwards);
    assert.equal(forwards.defaultPrevented, true);
    assert.equal(document.activeElement, closeButton);

    const withinSheet = new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    });
    closeButton.dispatchEvent(withinSheet);
    assert.equal(withinSheet.defaultPrevented, false);

    const sheet = $('[role="dialog"]');
    assert.ok(sheet);
    sheet.focus();
    assert.equal(document.activeElement, sheet);
    const backwardsFromSheet = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    sheet.dispatchEvent(backwardsFromSheet);
    assert.equal(document.activeElement, scroll);
  });

  it('restores focus to the latest opener when a different competition is opened', async (t) => {
    const { $, $$, act, cleanup, tile, sheet } = mount();
    t.after(cleanup);
    const otherTile = $$('main button')[1];
    assert.ok(otherTile);

    await act(() => tile.click());
    await act(() => $('[aria-label="Close"]')?.click());
    await act(() => otherTile.click());
    assert.equal(sheet.querySelector('b')?.textContent, 'La Liga');
    assert.equal(document.activeElement, $('[aria-label="Close"]'));

    await act(() => $('[aria-label="Close"]')?.click());
    assert.equal(document.activeElement, otherTile);
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
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
    clientY,
  }));
}

function waitForFlickToFade() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

function scaleOf(element: HTMLElement) {
  return Number(element.style.transform.match(/scale\((.+)\)/)?.[1]);
}

function radiusOf(element: HTMLElement) {
  return Number(
    element.style.borderRadius.match(/calc\(var\(--radius-lg\) \* (.+)\)/)?.[1],
  );
}

function assertNear(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) < 1e-3,
    `expected ${actual} to be near ${expected}`,
  );
}

describe('home screen standings sheet drag', () => {
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

    const openFraction = 1 - 100 / closedPullDown;
    assert.equal(sheet.style.transform, 'translateY(100px)');
    assertNear(scaleOf(screen), 1 - openFraction * 0.07);
    assertNear(radiusOf(screen), openFraction);
    assertNear(Number(overlay.style.opacity), openFraction * 0.45);
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(getComputedStyle(layer).transitionDuration, '0s');
    }
    assert.equal(getComputedStyle(sheet.firstElementChild!).cursor, 'grabbing');

    await act(() => pointer(title, 'pointermove', 0));
    assert.equal(sheet.style.transform, 'translateY(-20px)');
    assert.equal(screen.style.transform, 'scale(0.93)');
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
    assert.equal(screen.style.transform, 'scale(0.93)');
  });

  it('snaps back open before halfway and closes past it', async (t) => {
    const { act, cleanup, tile, title, closedPullDown, screen, sheet, overlay } =
      await openSheet();
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
    assert.equal(screen.style.transform, 'scale(0.93)');
    assert.equal(radiusOf(screen), 1);
    assert.equal(overlay.style.opacity, '0.45');
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? '0s'
      : '0.48s';
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(getComputedStyle(layer).transitionDuration, duration);
    }

    await dragAndRelease(closedPullDown / 2 + 20);
    assert.equal(sheet.inert, true);
    assert.equal(sheet.style.transform, 'translateY(110%)');
    assert.equal(screen.style.transform, 'scale(1)');
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
