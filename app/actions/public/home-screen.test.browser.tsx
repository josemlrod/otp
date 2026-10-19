import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import type { StandingsResponse } from '../../lib/types/api.ts';
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
  view.container.style.cssText = `
    height: 600px;
    width: 390px;
    --ease-ios: cubic-bezier(0.32, 0.72, 0, 1);
    --bg: #0a0b0c;
    --surface: #151719;
  `;

  const tile = view.$('main button');
  const screen = view.$('main');
  const sheet = view.$('[role="dialog"]');
  const overlay = view.$('[aria-label="Close standings"]');
  assert.ok(tile && screen && sheet && overlay);

  return { ...view, tile, screen, sheet, overlay };
}

function paint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
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
    assert.equal(screen.style.borderRadius, '18px');
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
      assert.equal(screen.style.borderRadius, '0px');
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
  });

  it('animates the layers together and can reverse before opening finishes', async (t) => {
    const { $, act, cleanup, tile, screen, sheet, overlay } = mount();
    t.after(cleanup);
    await paint();
    await act(() => tile.click());
    await paint();

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const layer of [screen, sheet, overlay]) {
      assert.equal(layer.getAnimations().length > 0, !reduced);
    }

    await act(() => $('[aria-label="Close"]')?.click());
    await paint();
    assert.equal(document.activeElement, tile);
    assert.ok(sheet.querySelector('table'));

    await Promise.all(
      [screen, sheet, overlay].flatMap((layer) =>
        layer.getAnimations().map((animation) => animation.finished)
      ),
    );
    assert.equal(getComputedStyle(screen).transform, 'matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(getComputedStyle(overlay).opacity, '0');
    assert.ok(sheet.getBoundingClientRect().top >= screen.getBoundingClientRect().bottom);
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

  it('preserves content insets while letting the screen recede behind the sheet', async (t) => {
    const { container, act, cleanup, tile, screen, sheet } = mount();
    t.after(cleanup);
    // Simulate the safe-area padding that Document applies to the root.
    container.style.boxSizing = 'border-box';
    container.style.paddingTop = '44px';
    container.style.paddingBottom = '34px';
    container.style.setProperty('--safe-area-inset-top', '44px');
    container.style.setProperty('--safe-area-inset-bottom', '34px');
    await paint();

    const bounds = container.getBoundingClientRect();
    assert.equal(screen.parentElement?.getBoundingClientRect().height, 600);
    assert.equal(screen.getBoundingClientRect().top, bounds.top);
    assert.equal(getComputedStyle(screen.querySelector('header')!).paddingTop, '58px');

    await act(() => tile.click());
    await paint();
    await Promise.all(screen.getAnimations().map((animation) => animation.finished));

    assert.equal(sheet.getBoundingClientRect().top - bounds.top, 54);
    assert.equal(sheet.getBoundingClientRect().bottom, bounds.bottom);
    assert.ok(screen.getBoundingClientRect().top < sheet.getBoundingClientRect().top);
  });
});
