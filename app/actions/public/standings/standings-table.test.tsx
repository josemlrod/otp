import * as assert from 'remix/assert';
import { renderToString } from 'remix/component/server';
import { describe, it } from 'remix/test';

import type { StandingsResponse, StandingTableRow } from '../../../lib/types/api.ts';
import { Sheet } from './sheet.tsx';
import { StandingsTable } from './standings-table.tsx';

function row(overrides: Partial<StandingTableRow> = {}): StandingTableRow {
  return {
    position: 1,
    team: {
      id: 65,
      name: 'Manchester City FC',
      shortName: 'Man City',
      tla: 'MCI',
      crest: 'https://crests.football-data.org/65.png',
    },
    playedGames: 6,
    form: null,
    won: 6,
    draw: 0,
    lost: 0,
    points: 18,
    goalsFor: 16,
    goalsAgainst: 5,
    goalDifference: 11,
    ...overrides,
  };
}

function response(table: StandingTableRow[] = [row()]): StandingsResponse {
  return {
    filters: { season: '2026' },
    area: { id: 2072, name: 'England', code: 'ENG', flag: '' },
    competition: {
      id: 2021,
      name: 'Premier League',
      code: 'PL',
      type: 'LEAGUE',
      emblem: 'https://crests.football-data.org/PL.png',
    },
    season: {
      id: 2502,
      startDate: '2026-08-21',
      endDate: '2027-05-30',
      currentMatchday: 7,
      winner: null,
    },
    standings: [{ stage: 'REGULAR_SEASON', type: 'TOTAL', group: 'Matchday', table }],
  };
}

function clean(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

async function render(standing: StandingsResponse) {
  return clean(await renderToString(<StandingsTable standing={standing} />));
}

describe('standings table', () => {
  it('renders accessible table columns and API team data', async () => {
    const html = await render(response());

    assert.match(html, /<table\b/);
    assert.equal([...html.matchAll(/scope="col"/g)].length, 5);
    assert.match(html, /<caption[^>]*>Premier League standings, Matchday<\/caption>/);
    assert.match(html, /<th scope="row"[^>]*>/);
    assert.match(html, /title="Manchester City FC">Man City<\/span>/);
    assert.match(html, /src="https:\/\/crests\.football-data\.org\/65\.png"/);
    assert.match(html, /alt=""/);
  });

  it('uses API position and row games played, not array index or season matchday', async () => {
    const html = await render(response([row({ position: 4 })]));
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';

    assert.match(body, /<td[^>]*>4<\/td>/);
    assert.match(body, /<td[^>]*>6<\/td>/);
    assert.match(body, /<td[^>]*><b>18<\/b><\/td>/);
    assert.doesNotMatch(body, /<td[^>]*>7<\/td>/);
  });

  for (const [goalDifference, expected] of [[11, '+11'], [0, '0'], [-4, '-4']] as const) {
    it(`formats goal difference ${goalDifference} as ${expected}`, async () => {
      const html = await render(response([row({ goalDifference })]));
      assert.ok(html.includes(`<td>${expected}</td>`));
    });
  }

  it('ignores HOME and AWAY breakdowns even when they precede TOTAL', async () => {
    const standing = response();
    const total = standing.standings[0];
    standing.standings = [
      { ...total, type: 'HOME', table: [row({ points: 101 })] },
      { ...total, type: 'AWAY', table: [row({ points: 102 })] },
      total,
    ];
    const html = await render(standing);

    assert.equal([...html.matchAll(/<table\b/g)].length, 1);
    assert.match(html, /<b>18<\/b>/);
    assert.doesNotMatch(html, /<b>10[12]<\/b>/);
  });

  it('renders multiple TOTAL groups separately with their group names', async () => {
    const standing = response();
    const total = standing.standings[0];
    standing.standings = [
      { ...total, group: 'GROUP_A' },
      { ...total, group: 'GROUP_B', table: [row({ points: 9 })] },
    ];
    const html = await render(standing);

    assert.equal([...html.matchAll(/<table\b/g)].length, 2);
    assert.match(html, /standings, GROUP A<\/caption>/);
    assert.match(html, /standings, GROUP B<\/caption>/);
    assert.match(html, /<b>18<\/b>/);
    assert.match(html, /<b>9<\/b>/);
  });

  it('handles missing TOTAL groups without showing a partial table as overall standings', async () => {
    const standing = response();
    standing.standings = [{ ...standing.standings[0], type: 'HOME' }];
    const html = await render(standing);

    assert.match(html, /No standings available\./);
    assert.doesNotMatch(html, /<table\b/);
  });

  it('handles an empty standings array', async () => {
    const standing = response();
    standing.standings = [];
    const html = await render(standing);

    assert.match(html, /No standings available\./);
    assert.doesNotMatch(html, /<table\b/);
  });

  it('handles an empty TOTAL table', async () => {
    const html = await render(response([]));

    assert.match(html, /colspan="5"/);
    assert.match(html, /No standings available\./);
  });

  it('uses the full team name when a short name is unavailable', async () => {
    const team = { ...row().team, shortName: '', crest: '' };
    const html = await render(response([row({ team })]));

    assert.match(html, /title="Manchester City FC">Manchester City FC<\/span>/);
    assert.doesNotMatch(html, /<img\b/);
  });

  it('renders the body within the sheet without unavailable mock sections', async () => {
    const html = clean(await renderToString(
      <Sheet standing={response()} open={true} onClose={() => {}} />,
    ));

    assert.match(html, /<b id="[^"]+-title">Premier League<\/b>/);
    assert.match(html, /aria-labelledby="[^"]+-title"/);
    assert.match(html, /Matchday 7 of 38/);
    assert.match(html, /<table\b/);
    assert.doesNotMatch(html, /Top scorers|Assists|Clean sheets|Relegation|ds-mine/);
    assert.match(html, /overflow-y: auto/);
    assert.match(html, /touch-action: pan-y/);
  });

  it('does not render a table when the sheet has no selected standing', async () => {
    const html = await renderToString(
      <Sheet standing={null} open={false} onClose={() => {}} />,
    );

    assert.doesNotMatch(html, /<table\b/);
  });

  it('keeps selected content in the closed sheet for its exit transition', async () => {
    const html = clean(await renderToString(
      <Sheet standing={response()} open={false} onClose={() => {}} />,
    ));

    assert.match(html, /<table\b/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /\binert(?:[\s=>])/);
    assert.match(html, /translateY\(110%\)/);
    assert.match(html, /transition-duration: var\(--sheet-duration, 480ms\)/);
    assert.match(html, /prefers-reduced-motion: reduce/);
  });
});
