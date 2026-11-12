import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildClub, buildClubMatches, buildStandings, buildTeam } from '../../../fixtures/builders.ts';
import { tokens } from '../../../ui/theme.ts';
import { MatchesModel } from '../clubs/matches.ts';
import { WideHome } from './wide-home.tsx';

const arsenal = buildTeam({ id: 57, shortName: 'Arsenal' });
const liverpool = buildTeam({ id: 64, shortName: 'Liverpool' });
const chelsea = buildTeam({ id: 61, shortName: 'Chelsea' });
const everton = buildTeam({ id: 62, shortName: 'Everton' });
const bayern = buildTeam({ id: 5, shortName: 'Bayern' });

const standings = [
  buildStandings('PL', {
    clubs: [arsenal, liverpool, chelsea, everton],
    rows: [
      { playedGames: 10, won: 9, draw: 0, lost: 1, points: 27, goalsFor: 15, goalsAgainst: 5, goalDifference: 10 },
      { playedGames: 10, won: 5, draw: 3, lost: 2, points: 18, goalsFor: 14, goalsAgainst: 10, goalDifference: 4 },
      { playedGames: 10, won: 5, draw: 1, lost: 4, points: 16, goalsFor: 19, goalsAgainst: 16, goalDifference: 3 },
      { playedGames: 10, won: 4, draw: 4, lost: 2, points: 16, goalsFor: 12, goalsAgainst: 10, goalDifference: 2 },
    ],
  }),
  buildStandings('CL', { clubs: [bayern, arsenal] }),
];

const clubs = [
  buildClub({ id: 57, name: 'Arsenal', position: 1 }),
  buildClub({ id: 64, name: 'Liverpool', position: 2 }),
];

function mount({ width = 951, height = 620 } = {}) {
  const matches = new MatchesModel(
    [
      buildClubMatches({
        club: arsenal,
        form: 'WDLWW',
        results: [...'WDLWW'].map((result, i) => ({
          result: result as 'W' | 'D' | 'L',
          days: -(5 - i) * 7,
          opponent: [liverpool, chelsea, everton, bayern, chelsea][i],
          competition: i === 3 ? 'CL' : 'PL',
        })),
        fixtures: [
          { days: 2, opponent: chelsea, venue: 'A', competition: 'PL' },
          { days: 9, opponent: bayern, venue: 'H', competition: 'CL' },
          { days: 16, opponent: everton, venue: 'H', competition: 'PL' },
        ],
      }),
      buildClubMatches({ club: liverpool, form: 'WWDLW', fixtures: [3] }),
    ],
    { now: () => NOW },
  );
  const edits: HTMLButtonElement[] = [];
  const view = render(
    <WideHome
      clubs={clubs}
      standings={standings}
      matches={matches}
      clock={{ now: NOW, timeZone: 'Europe/London', pinned: true }}
      onEdit={(button) => edits.push(button)}
    />,
  );
  view.container.style.cssText = `position: relative; display: flex; flex-direction: column; width: ${width}px; height: ${height}px;`;
  for (const [token, value] of Object.entries(tokens)) view.container.style.setProperty(token, value);

  const page = () => view.$('[data-page]:not([data-leave])')!;
  const block = (id: string) => page().querySelector<HTMLElement>(`[data-block="${id}"]`);
  const grip = () => (view.$('[role="separator"]') as HTMLElement);
  const sidebar = () => (view.$('aside') as HTMLElement);
  return { ...view, page, block, grip, sidebar, edits };
}

const frames = (n = 2) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
    step(n);
  });
const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

function pointer(target: Element, type: string, clientX: number, clientY = 300) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX,
      clientY,
    }),
  );
}

function forgetWidth() {
  try {
    localStorage.removeItem('otp.sidebarWidth');
  } catch {}
}

describe('wide home: club page', () => {
  it('lays out the next match, the fixtures after it and the last five instead of the timeline', async (t) => {
    const { cleanup, block, page } = mount();
    t.after(cleanup);
    await frames();

    assert.equal(page().querySelector('h2')?.textContent, 'Arsenal');
    assert.equal(page().querySelector('[data-club-card], [data-pills], [data-pager]'), null, 'no timeline');

    const next = block('next')!;
    assert.match(next.textContent!, /Next match/);
    assert.match(next.textContent!, /Premier League · Away/);
    // Away at Chelsea: the home side is on the left.
    const sides = [...next.querySelectorAll('b')].slice(0, 2).map((b) => b.textContent);
    assert.deepEqual(sides, ['Chelsea', 'Arsenal']);
    const position = [...next.querySelectorAll('dl > div')].find((row) => row.querySelector('dt')?.textContent === 'Position')!;
    assert.deepEqual([...position.querySelectorAll('dd')].map((dd) => dd.textContent), ['3rd', '1st']);
    assert.equal(position.getAttribute('data-better'), 'away');

    // The next fixture is the hero, so "After that" starts with the one after it.
    const after = [...block('fixtures')!.querySelectorAll('li')];
    assert.equal(after.length, 2);
    assert.match(after[0]!.textContent!, /vs Bayern/);
    assert.match(after[1]!.textContent!, /vs Everton.*4th PL/);

    const results = block('results')!;
    assert.match(results.textContent!, /Last 5/);
    assert.match(results.textContent!, /3W 1D 1L/);
    const rows = [...results.querySelectorAll('li')];
    assert.equal(rows.length, 5);
    assert.match(rows[0]!.textContent!, /Won · Home.*vs Chelsea/, 'newest first');

    assert.match(block('season')!.textContent!, /Played\s*10.*Points\s*27/);
    assert.ok(block('league')!.querySelector('tr[data-mine]'));
    assert.ok(block('cl'), 'a club in the Champions League also gets its corner of that table');
  });

  it('flows blocks into three columns in landscape and two in portrait', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    await frames();
    const grid = () => view.page().querySelector<HTMLElement>('[data-cols]')!;
    assert.equal(grid().dataset.cols, '3');
    assert.deepEqual(
      [...grid().children].map((column) => [...column.children].map((block) => (block as HTMLElement).dataset.block)),
      [['next', 'fixtures'], ['results', 'season'], ['league', 'cl']],
    );

    view.container.style.width = '669px';
    view.container.style.height = '902px';
    await frames(4);
    await view.act(() => {});
    assert.equal(grid().dataset.cols, '2');
  });
});

describe('wide home: sidebar', () => {
  it('opens a competition page with the full table, and a club from it', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    await frames();

    await view.act(() => (view.$('[data-item="competition:PL"]') as HTMLButtonElement).click());
    assert.equal(view.page().querySelector('h2')?.textContent, 'Premier League');
    const table = view.block('table')!;
    assert.equal(table.querySelectorAll('tbody tr').length, 4);
    assert.equal(table.querySelectorAll('tbody tr[data-mine]').length, 2, 'Your clubs are lit');
    assert.equal(view.$('[data-item="competition:PL"]')!.getAttribute('aria-current'), 'page');

    const liverpoolRow = [...view.block('yours')!.querySelectorAll('button')].find((b) => /Liverpool/.test(b.textContent!))!;
    await view.act(() => liverpoolRow.click());
    assert.equal(view.page().querySelector('h2')?.textContent, 'Liverpool');
  });

  it('slides out over the content from the keyboard and puts itself away on a pick', async (t) => {
    const view = mount();
    t.after(() => (forgetWidth(), view.cleanup()));
    await frames();
    const detail = (view.$('[data-detail]') as HTMLElement);

    view.grip().focus();
    view.grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert.equal(view.grip().getAttribute('aria-expanded'), 'true');
    assert.equal(detail.inert, true, 'the content behind is out of reach');
    assert.equal(Math.round(view.sidebar().getBoundingClientRect().width), 300);
    assert.ok(view.sidebar().hasAttribute('data-floating'));

    await view.act(() => (view.$('[data-item="club:64"]') as HTMLButtonElement).click());
    await settle();
    assert.equal(view.grip().getAttribute('aria-expanded'), 'false');
    assert.equal(detail.inert, false);
    assert.equal(Math.round(view.sidebar().getBoundingClientRect().width), 76);
    assert.equal(view.page().querySelector('h2')?.textContent, 'Liverpool');
  });

  it('follows a drag on the grip, stays where it is released, and closes on Escape', async (t) => {
    const view = mount();
    t.after(() => (forgetWidth(), view.cleanup()));
    await frames();
    const left = view.container.getBoundingClientRect().left;

    pointer(view.grip(), 'pointerdown', left + 76);
    for (let x = 76; x <= 340; x += 24) {
      pointer(view.grip(), 'pointermove', left + x);
      assert.equal(Math.round(view.sidebar().getBoundingClientRect().width), x, 'tracks 1:1');
    }
    await new Promise((resolve) => setTimeout(resolve, 120)); // let the flick go still
    pointer(view.grip(), 'pointerup', left + 340);
    await settle();
    assert.equal(view.grip().getAttribute('aria-expanded'), 'true');
    assert.equal(Math.round(view.sidebar().getBoundingClientRect().width), 340);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    assert.equal(view.grip().getAttribute('aria-expanded'), 'false');
    assert.equal(Math.round(view.sidebar().getBoundingClientRect().width), 76);
  });

  it('hands Edit to the club picker', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    await frames();
    const edit = (view.$('[data-clubs-opener]') as HTMLButtonElement);
    edit.click();
    assert.deepEqual(view.edits, [edit]);
  });
});
