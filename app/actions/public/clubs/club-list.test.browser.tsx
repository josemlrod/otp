import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildTeam, buildClubCard, buildClub } from '../../../fixtures/builders.ts';
import { tokens } from '../../../ui/theme.ts';
import { ClubList } from './club-list.tsx';
import { MatchesModel } from './matches.ts';

const clubs = [
  buildClub({ id: 57, name: 'Arsenal', position: 1 }),
  buildClub({ id: 64, name: 'Liverpool', position: 3 }),
  buildClub({ id: 5, name: 'Bayern', position: 1 }),
];

function mount(height = 700) {
  const now = NOW;
  const matches = new MatchesModel(clubs.map((club) => buildClubCard({
    team: buildTeam({ id: club.id }), now, form: 'WDLWW',
    fixtures: [2, 9].map((days) => ({ days: days + 1 / 24, venue: 'A' })),
  })), { now: () => NOW });
  const clock = { now: NOW, timeZone: 'Europe/Madrid' };
  const view = render(<ClubList clubs={clubs} matches={matches} clock={clock} />);
  view.container.style.cssText = `display: flex; flex-direction: column; width: 390px; height: ${height}px;`;
  for (const [token, value] of Object.entries(tokens)) {
    view.container.style.setProperty(token, value);
  }
  const item = (id: number) => view.$(`[data-fc][data-id="${id}"]`)!;
  const row = (id: number) => item(id).querySelector<HTMLButtonElement>(':scope > button')!;
  return { ...view, item, row };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe('club list', () => {
  it('opens the first club as a full card and lists the rest as rows', async (t) => {
    const { cleanup, item, row } = mount();
    t.after(cleanup);
    await nextFrame();

    assert.ok(item(57).hasAttribute('data-open'));
    assert.equal(row(57).inert, true);
    assert.equal(row(64).getAttribute('aria-expanded'), 'false');
    assert.equal(item(64).style.height, '44px');
    assert.ok(parseFloat(item(57).style.height) > 100, 'the open card is measured');
    assert.match(row(64).textContent!, /Liverpool.*2d\s*at CHE/);

    const open = item(57).querySelector<HTMLElement>('[data-club-card]')!;
    const pills = [...open.querySelectorAll('[data-pill]')];
    assert.deepEqual(pills.map((p) => p.textContent), ['W', 'D', 'L', 'W', 'W', 'Next']);
    assert.ok(pills.at(-1)!.hasAttribute('data-lit'), 'the pick starts on Next');
    assert.ok(open.hasAttribute('data-now'));
    assert.match(open.querySelector<HTMLElement>('[data-track]')!.style.transform, /translate3d\(-\d+(\.\d+)?px/);
    assert.match(open.textContent!, /3rd|1st/);
    assert.match(open.textContent!, /2d1h/);
    assert.match(open.textContent!, /Next · Tue 14:00/);
  });

  it('opens a row when tapped and folds the previous card back into a row', async (t) => {
    const { act, cleanup, item, row } = mount();
    t.after(cleanup);
    await nextFrame();

    await act(() => row(64).click());
    await nextFrame();

    assert.ok(item(64).hasAttribute('data-open'));
    assert.equal(item(57).hasAttribute('data-open'), false);
    assert.equal(row(64).getAttribute('aria-expanded'), 'true');
    assert.equal(row(57).inert, false);
    assert.equal(item(57).style.height, '44px');
  });

  it('shows how many clubs are past the bottom edge when the list overflows', async (t) => {
    const { $, cleanup } = mount(180);
    t.after(cleanup);
    await nextFrame();

    const bottom = $('[data-side="bottom"]')!;
    const top = $('[data-side="top"]')!;
    assert.ok(bottom.hasAttribute('data-on'));
    assert.equal(top.hasAttribute('data-on'), false);
    assert.match(bottom.textContent!, /↓ [1-9] more/);
  });
});
