import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { toTeamCard } from '../lib/team-card.ts';
import {
  NOW,
  buildTeam,
  buildClubCard,
  buildClub,
  buildMatches,
  buildStandings,
} from './builders.ts';

describe('scenario builders', () => {
  it('assigns positions from club order and supports separate and empty groups', () => {
    const clubs = [buildTeam({ id: 9 }), buildTeam({ id: 2 })];
    const standing = buildStandings('CL', {
      groups: [
        { clubs, stage: 'GROUP_STAGE', group: 'GROUP_A' },
        { clubs: [...clubs].reverse(), type: 'HOME' },
        { clubs, type: 'AWAY' },
      ],
    });
    assert.deepEqual(
      standing.standings[0]!.table.map((row) => [row.team.id, row.position]),
      [
        [9, 1],
        [2, 2],
      ],
    );
    assert.deepEqual(
      standing.standings[1]!.table.map((row) => [row.team.id, row.position]),
      [
        [2, 1],
        [9, 2],
      ],
    );
    assert.equal(standing.standings[0]!.stage, 'GROUP_STAGE');
    assert.equal(standing.standings[2]!.type, 'AWAY');
    assert.deepEqual(buildStandings('PL', { groups: [] }).standings, []);
  });

  it('uses tracked competition identities and allows arbitrary competitions', () => {
    assert.deepEqual(
      ['PL', 'BL1', 'SA', 'PD', 'FL1', 'CL'].map((code) => {
        const { id, name, type } = buildStandings(code).competition;
        return [id, name, type];
      }),
      [
        [2021, 'Premier League', 'LEAGUE'],
        [2002, 'Bundesliga', 'LEAGUE'],
        [2019, 'Serie A', 'LEAGUE'],
        [2014, 'La Liga', 'LEAGUE'],
        [2015, 'Ligue 1', 'LEAGUE'],
        [2001, 'UEFA Champions League', 'CUP'],
      ],
    );
    assert.equal(buildStandings('UNKNOWN', { competition: { id: 999 } }).competition.id, 999);
    assert.equal(buildStandings('UNKNOWN').competition.code, 'UNKNOWN');
  });

  it('turns form into finished scores from the club side, oldest first', () => {
    const response = buildMatches({ form: 'WDLWW' });
    assert.deepEqual(
      response.matches.map((match) => [match.status, match.score.fullTime]),
      [
        ['FINISHED', { home: 2, away: 0 }],
        ['FINISHED', { home: 2, away: 2 }],
        ['FINISHED', { home: 0, away: 2 }],
        ['FINISHED', { home: 2, away: 0 }],
        ['FINISHED', { home: 2, away: 0 }],
      ],
    );
    assert.equal(response.resultSet.wins, 3);
    assert.equal(Date.parse(response.matches.at(-1)!.utcDate), NOW - 7 * 86_400_000);
    const away = buildMatches({ results: [{ result: 'W', venue: 'A' }] }).matches[0]!;
    assert.deepEqual(away.score.fullTime, { home: 0, away: 2 });
    assert.equal(away.score.winner, 'AWAY_TEAM');
    assert.throws(() => buildMatches({ form: 'WX' }));
  });

  it('sorts fixtures relative to the supplied clock and round-trips through the projection', () => {
    const options = {
      now: NOW + 1000,
      team: buildTeam({ id: 5 }),
      form: 'WDLWW',
      fixtures: [
        9,
        { days: 2, venue: 'A' as const, competition: 'CL', opponent: buildTeam({ id: 7 }) },
      ],
    };
    const response = buildMatches(options);
    const card = buildClubCard(options);
    assert.deepEqual(card, toTeamCard(response, 5, options.now));
    assert.deepEqual(
      card.fixtures.map((fixture) => (Date.parse(fixture.utcDate) - options.now) / 86_400_000),
      [2, 9],
    );
    assert.equal(card.fixtures[0]!.competition, 'CL');
    assert.equal(card.fixtures[0]!.opponent.id, 7);
    assert.equal(card.fixtures[0]!.venue, 'A');
    assert.equal(buildClubCard().fetchedAt, NOW);
    assert.equal(buildClub({ id: 5, name: 'Bayern' }).fullName, 'Bayern FC');
  });
});
