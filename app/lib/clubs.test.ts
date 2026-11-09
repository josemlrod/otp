import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { clubSections, leagueLeaders } from './clubs.ts';
import { parseFollows } from './follows.ts';
import { buildTeam, buildStandings } from '../fixtures/builders.ts';

const standing = (code: string, type: string, clubs: [number, string][]) => buildStandings(code, {
  competition: { name: `${code} name`, type },
  clubs: clubs.map(([id, shortName]) => buildTeam({ id, shortName })),
});

const cup = standing('CL', 'CUP', [[1, 'Leader'], [9, 'Porto'], [3, 'Ajax']]);
const premier = standing('PL', 'LEAGUE', [[1, 'Leader'], [2, 'Arsenal']]);
const liga = standing('PD', 'LEAGUE', [[4, 'Madrid'], [5, 'Betis']]);

describe('club sections', () => {
  it('lists leagues first, sorted by name, and leaves only unseen cup clubs in Rest of Europe', () => {
    const sections = clubSections([cup, premier, liga]);

    assert.deepEqual(
      sections.map((s) => [s.code, s.name, s.clubs.map((c) => c.name)]),
      [
        ['PL', 'PL name', ['Arsenal', 'Leader']],
        ['PD', 'PD name', ['Betis', 'Madrid']],
        ['CL', 'Rest of Europe', ['Ajax', 'Porto']],
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
