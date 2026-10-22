import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { clubSections, leagueLeaders } from './clubs.ts';
import { parseFollows } from './follows.ts';
import type { StandingsResponse } from './types/api.ts';

function standing(code: string, type: string, teams: [number, string][]): StandingsResponse {
  return {
    filters: { season: '2026' },
    area: { id: 1, name: 'Area', code: 'AR', flag: '' },
    competition: { id: teams[0]![0], name: `${code} name`, code, type, emblem: '' },
    season: { id: 1, startDate: '', endDate: '', currentMatchday: 1, winner: null },
    standings: [{
      stage: 'REGULAR_SEASON',
      type: 'TOTAL',
      group: null,
      table: teams.map(([id, shortName], index) => ({
        position: index + 1,
        team: { id, name: `${shortName} FC`, shortName, tla: '', crest: '' },
        playedGames: 0, form: null, won: 0, draw: 0, lost: 0, points: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
      })),
    }],
  };
}

const cup = standing('CL', 'CUP', [[1, 'Leader'], [9, 'Porto'], [3, 'Ajax']]);
const premier = standing('PL', 'LEAGUE', [[1, 'Leader'], [2, 'Arsenal']]);
const liga = standing('PD', 'LEAGUE', [[4, 'Madrid'], [5, 'Betis']]);

describe('club sections', () => {
  it('lists only league clubs, sorted by name, and skips cup competitions', () => {
    const sections = clubSections([cup, premier, liga]);

    assert.deepEqual(
      sections.map((s) => [s.code, s.name, s.clubs.map((c) => c.name)]),
      [
        ['PL', 'PL name', ['Arsenal', 'Leader']],
        ['PD', 'PD name', ['Betis', 'Madrid']],
      ],
    );
  });

  it('previews each league leader in order', () => {
    assert.deepEqual(leagueLeaders([cup, premier, liga], 3).map((c) => c.name), ['Leader', 'Madrid']);
  });
});

describe('follows cookie', () => {
  it('keeps unique positive ids in order and drops junk', () => {
    assert.deepEqual(parseFollows('57.86.x.-3.0.57.5'), [57, 86, 5]);
    assert.deepEqual(parseFollows(''), []);
    assert.deepEqual(parseFollows(undefined), []);
  });
});
