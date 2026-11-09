import * as assert from 'remix/assert';
import { renderToString } from 'remix/component/server';
import { describe, it } from 'remix/test';

import { buildTeam, buildStandingRow, buildStandings } from '../../../fixtures/builders.ts';
import type { StandingsResponse, StandingTableRow } from '../../../lib/types/api.ts';
import { StandingsSheet } from './standings-sheet.tsx';
import { StandingsTable } from './standings-table.tsx';

const row = (overrides: Partial<StandingTableRow> = {}) =>
  buildStandingRow({
    team: buildTeam({
      id: 65,
      name: 'Manchester City FC',
      shortName: 'Man City',
      tla: 'MCI',
      crest: 'https://crests.football-data.org/65.png',
    }),
    playedGames: 6,
    won: 6,
    points: 18,
    goalsFor: 16,
    goalsAgainst: 5,
    goalDifference: 11,
    ...overrides,
  });

const response = (rows: StandingTableRow[] = [row()], code = 'PL') =>
  buildStandings(code, { rows, group: 'Matchday' });

function clean(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

async function render(standing: StandingsResponse) {
  return clean(await renderToString(<StandingsTable standing={standing} />));
}

describe('standings table', () => {
  it('signs positive goal differences only', async () => {
    const html = await render(
      response([
        row({ goalDifference: 11 }),
        row({ goalDifference: 0 }),
        row({ goalDifference: -4 }),
      ]),
    );

    for (const expected of ['+11', '0', '-4']) {
      assert.ok(html.includes(`<td>${expected}</td>`), expected);
    }
  });

  it('falls back to the full team name and omits a missing crest', async () => {
    const team = { ...row().team, shortName: '', crest: '' };
    const html = await render(response([row({ team })]));

    assert.match(html, /title="Manchester City FC">Manchester City FC<\/span>/);
    assert.doesNotMatch(html, /<img\b/);
  });

  it('renders one captioned table per TOTAL group and ignores HOME and AWAY', async () => {
    const standing = response();
    const total = standing.standings[0];
    standing.standings = [
      { ...total, type: 'HOME', table: [row({ points: 101 })] },
      { ...total, group: 'GROUP_A' },
      { ...total, group: 'GROUP_B', table: [] },
    ];
    const html = await render(standing);

    assert.equal([...html.matchAll(/<table\b/g)].length, 2);
    assert.match(html, /standings, GROUP A<\/caption>/);
    assert.match(html, /standings, GROUP B<\/caption>/);
    assert.match(html, /colspan="5"[^>]*>No standings available\./);
    assert.doesNotMatch(html, /<b>101<\/b>/);
  });

  it('shows an empty state when there is no TOTAL group', async () => {
    const standing = response();
    standing.standings = [{ ...standing.standings[0], type: 'HOME' }];
    const html = await render(standing);

    assert.match(html, /No standings available\./);
    assert.doesNotMatch(html, /<table\b/);
  });
});

describe('standings sheet', () => {
  for (const [code, label] of [
    ['PL', 'Matchday 7 of 38'],
    ['CL', 'League phase 7 of 8'],
    ['FL1', 'Matchday 7'],
  ]) {
    it(`labels ${code} progress as "${label}"`, async () => {
      const html = await renderToString(
        <StandingsSheet standing={response([], code)} titleId="title" onClose={() => {}} />,
      );

      assert.ok(clean(html).includes(`>${label}<`));
    });
  }
});
