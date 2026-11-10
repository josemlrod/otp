import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildTeam, buildStandings } from '../../fixtures/builders.ts';
import { clubSections } from '../../lib/clubs.ts';
import { resolveYourClubs } from '../../lib/your-clubs.ts';
import type { StandingsResponse } from '../../lib/types/api.ts';
import { tokens } from '../../ui/theme.ts';
import { renderStats } from './perf/renders.ts';
import { HomeScreen } from './home-screen.tsx';

const standing = buildStandings('PL', { group: 'Matchday' });
const otherStanding = buildStandings('PD', { group: 'Matchday' });

function mountHome({
  standings,
  saved = [],
  complete = true,
}: {
  standings: StandingsResponse[];
  saved?: number[];
  complete?: boolean;
}) {
  const sections = clubSections(standings);
  return render(
    <HomeScreen
      clock={{ now: NOW, timeZone: 'UTC', pinned: true }}
      standings={standings}
      sections={sections}
      yourClubs={resolveYourClubs(saved, sections, complete)}
    />,
  );
}

function mount() {
  const view = mountHome({ standings: [standing, otherStanding] });
  view.container.style.cssText = 'height: 600px; width: 390px;';
  for (const [token, value] of Object.entries(tokens)) {
    view.container.style.setProperty(token, value);
  }

  const tile = view.$('main button');
  const screen = view.$('main');
  const sheet = view.$('[role="dialog"]');
  const overlay = view.$('[aria-label="Close sheet"]');
  assert.ok(tile && screen && sheet && overlay);

  return {
    ...view,
    tile,
    screen,
    sheet,
    overlay,
  };
}

describe('home screen standings sheet', () => {
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

describe('home screen club picker', () => {
  const clubs = buildStandings('PL', {
    clubs: [
      buildTeam({ id: 57, shortName: 'Arsenal', name: 'Arsenal FC' }),
      buildTeam({ id: 5, shortName: 'Bayern', name: 'FC Bayern München' }),
    ],
  });

  function mountPicker() {
    const view = mountHome({ standings: [clubs] });
    for (const [token, value] of Object.entries(tokens)) {
      view.container.style.setProperty(token, value);
    }
    const choose = view.$('main [data-clubs-opener]');
    assert.ok(choose);
    return { ...view, choose };
  }

  function tile(name: string) {
    const found = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [data-section] button'),
    ).find((button) => button.textContent?.trim() === name);
    assert.ok(found, name);
    return found;
  }

  it('saves picked clubs on Done and returns focus to Edit', async (t) => {
    const { $, act, cleanup, choose } = mountPicker();
    t.after(() => {
      document.cookie = 'otp_follows=; Path=/; Max-Age=0';
      cleanup();
    });

    await act(() => choose.click());
    const done = $('[role="dialog"] [data-sheet-autofocus]');
    assert.equal(document.activeElement, done);
    assert.equal(choose.textContent?.trim(), 'Choose clubs');

    await act(() => tile('Arsenal').click());
    assert.equal(tile('Arsenal').getAttribute('aria-pressed'), 'true');
    assert.ok($('[aria-label="Remove Arsenal"]'));
    assert.match(
      $('main')!.textContent!,
      /Build your stack/,
      'home keeps the empty state until the sheet closes',
    );

    await act(() => done!.click());
    assert.match(document.cookie, /otp_follows=57/);
    assert.doesNotMatch($('main')!.textContent!, /Build your stack/);
    assert.ok($('main [data-fc][data-id="57"][data-open]'), 'the new club gets an open card');
    assert.match($('main section:last-child p')!.textContent!, /Your clubs · 1/);
    assert.equal(document.activeElement?.textContent, 'Edit');
  });

  it('saves picked clubs when Escape closes the picker', async (t) => {
    const { $, act, cleanup, choose } = mountPicker();
    t.after(() => {
      document.cookie = 'otp_follows=; Path=/; Max-Age=0';
      cleanup();
    });
    await act(() => choose.click());
    await act(() => tile('Arsenal').click());
    await act(() =>
      $('[data-sheet-autofocus]')!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.match(document.cookie, /otp_follows=57/);
    assert.equal($('[role="dialog"]')!.inert, true);
    assert.ok($('main [data-fc][data-id="57"]'));
  });

  for (const method of ['overlay', 'drag']) {
    it(`saves picked clubs when ${method} closes the picker`, async (t) => {
      const { $, act, cleanup, choose } = mountPicker();
      t.after(() => {
        document.cookie = 'otp_follows=; Path=/; Max-Age=0';
        cleanup();
      });
      await act(() => choose.click());
      await act(() => tile('Arsenal').click());
      if (method === 'overlay') {
        await act(() => $('[aria-label="Close sheet"]')!.click());
      } else {
        const grab = $('[data-sheet-grab]')!;
        const distance = $('[role="dialog"]')!.offsetHeight + 30;
        await act(() => pointer(grab, 'pointerdown', 100));
        await act(() => pointer(grab, 'pointermove', 100 + distance));
        await waitForFlickToFade();
        await act(() => pointer(grab, 'pointerup', 100 + distance));
      }
      assert.match(document.cookie, /otp_follows=57/);
      assert.equal($('[role="dialog"]')!.inert, true);
      assert.ok($('main [data-fc][data-id="57"]'));
    });
  }

  it('matches full names ignoring accents and reports misses', async (t) => {
    const { $, act, cleanup, choose } = mountPicker();
    t.after(cleanup);
    await act(() => choose.click());
    const search = $('[role="dialog"] input[type="search"]') as HTMLInputElement;

    await act(() => {
      search.value = 'munchen';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.deepEqual(
      Array.from(document.querySelectorAll('[role="dialog"] [data-section] b')).map(
        (b) => b.textContent,
      ),
      ['Bayern'],
    );

    await act(() => {
      search.value = 'zzz';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.match($('[role="dialog"]')!.textContent!, /No clubs match “zzz”/);
  });

  it('preserves Bayern when adding Arsenal during a partial standings outage', async (t) => {
    const standings = [
      buildStandings('PL', {
        clubs: [
          buildTeam({ id: 57, shortName: 'Arsenal' }),
          buildTeam({ id: 61, shortName: 'Chelsea' }),
        ],
      }),
    ];
    const view = mountHome({ standings, saved: [61, 5], complete: false });
    t.after(() => {
      document.cookie = 'otp_follows=; Path=/; Max-Age=0';
      view.cleanup();
    });
    await view.act(() => view.$('main [data-clubs-opener]')!.click());
    await view.act(() => tile('Arsenal').click());
    await view.act(() => view.$('[data-sheet-autofocus]')!.click());
    assert.match(document.cookie, /otp_follows=61\.57\.5(?:;|$)/);
  });
});

describe('home screen sheet render cost', () => {
  it('does not render HomeScreen or Sheet on repeated drag moves', async (t) => {
    const { $, tile, act, cleanup, sheet } = mount();
    t.after(() => { renderStats.enabled = false; renderStats.counts.clear(); cleanup(); });
    await act(() => tile.click());
    const grab = $('[data-sheet-grab]')!;
    renderStats.enabled = true;
    renderStats.counts.clear();
    await act(() => pointer(grab, 'pointerdown', 100));
    await act(() => pointer(grab, 'pointermove', 120));
    assert.equal(renderStats.counts.get('Sheet'), 1, 'renders at drag start');
    for (const y of [130, 140, 150, 160]) {
      await act(() => pointer(grab, 'pointermove', y));
      await new Promise(requestAnimationFrame);
      assert.equal(sheet.parentElement!.style.getPropertyValue('--sheet-pull'), `${y - 100}px`);
    }
    assert.equal(renderStats.counts.get('HomeScreen') ?? 0, 0);
    assert.equal(renderStats.counts.get('Sheet'), 1);
    await waitForFlickToFade();
    await act(() => pointer(grab, 'pointerup', 160));
    assert.equal(renderStats.counts.get('Sheet'), 2, 'renders at drag end');
    assert.equal(sheet.parentElement!.style.getPropertyValue('--sheet-drag'), '');
    assert.equal(sheet.parentElement!.style.getPropertyValue('--sheet-pull'), '');
    assert.equal(sheet.inert, false);
    await act(() => $('[aria-label="Close"]')!.click());
    await act(() => tile.click());
    assert.equal(sheet.style.transform, 'translateY(0px)', 'no gesture style sticks on reopen');
  });
});
