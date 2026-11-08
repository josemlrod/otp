import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import type { Club } from '../../../lib/clubs.ts';
import type { TeamCard } from '../../../lib/team-card.ts';
import { tokens } from '../../../ui/theme.ts';
import { ClubList } from './club-list.tsx';
import { MatchesModel } from './matches.ts';

const club = (id: number, name: string, position: number): Club => ({
  id,
  name,
  fullName: `${name} FC`,
  crest: '',
  competitionCode: 'PL',
  position,
});

const opponent = { id: 99, name: 'Chelsea', tla: 'CHE', crest: '' };
const day = 86_400_000;

const card = (teamId: number): TeamCard => ({
  teamId,
  fetchedAt: Date.now(),
  form: (['W', 'D', 'L', 'W', 'W'] as const).map((result, i) => ({
    utcDate: new Date(Date.now() - (5 - i) * 7 * day).toISOString(),
    result,
    gf: result === 'L' ? 0 : 2,
    ga: result === 'W' ? 0 : 2,
    venue: 'H',
    opponent,
    competition: 'PL',
  })),
  fixtures: [2, 9].map((days) => ({
    utcDate: new Date(Date.now() + days * day + 3_600_000).toISOString(),
    venue: 'A',
    opponent,
    competition: 'PL',
  })),
});

const clubs = [club(57, 'Arsenal', 1), club(64, 'Liverpool', 3), club(5, 'Bayern', 1)];

function mount(height = 700) {
  const matches = new MatchesModel(clubs.map((c) => card(c.id)));
  const view = render(<ClubList clubs={clubs} matches={matches} />);
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
