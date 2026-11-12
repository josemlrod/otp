import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { buildStandings, buildTeam } from '../fixtures/builders.ts';
import { pointsPerGame, rowsAround, signed, standingRow, totalRows } from './standings.ts';

const clubs = [1, 2, 3, 4, 5, 6, 7].map((id) => buildTeam({ id, shortName: `C${id}` }));
const league = buildStandings('PL', { clubs });

describe('standings lookups', () => {
  it('reads only the overall table', () => {
    const split = buildStandings('PL', {
      groups: [
        { type: 'HOME', clubs: clubs.slice(0, 2) },
        { type: 'TOTAL', clubs: clubs.slice(0, 3) },
      ],
    });
    assert.deepEqual(totalRows(split).map((row) => row.team.id), [1, 2, 3]);
  });

  it("finds a club's row in a competition, or nothing", () => {
    assert.equal(standingRow([league], 'PL', 3)?.position, 3);
    assert.equal(standingRow([league], 'PL', 99), undefined);
    assert.equal(standingRow([league], 'CL', 3), undefined);
  });

  it('centres a window on the club and clamps it to the table', () => {
    const ids = (id: number) => rowsAround(totalRows(league), id).map((row) => row.team.id);
    assert.deepEqual(ids(4), [2, 3, 4, 5, 6]);
    assert.deepEqual(ids(1), [1, 2, 3, 4, 5]);
    assert.deepEqual(ids(7), [3, 4, 5, 6, 7]);
    assert.deepEqual(rowsAround(totalRows(league).slice(0, 3), 2).map((row) => row.team.id), [1, 2, 3]);
  });

  it('formats points per game and signed differences', () => {
    assert.equal(pointsPerGame({ ...totalRows(league)[0], points: 27, playedGames: 10 }), 2.7);
    assert.equal(pointsPerGame({ ...totalRows(league)[0], points: 0, playedGames: 0 }), 0);
    assert.equal(signed(3), '+3');
    assert.equal(signed(0), '0');
    assert.equal(signed(-2), '-2');
  });
});
