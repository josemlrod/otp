import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { toClubMatches } from './club-matches.ts';
import { buildTeam, buildMatch, buildMatches } from '../fixtures/builders.ts';
import type { Match } from './types/api.ts';

const CLUB_ID = 57;

function match(
  utcDate: string,
  status: Match['status'],
  home: number,
  away: number,
  score: [number, number] | null = null,
  code = 'PL',
): Match {
  return buildMatch({
    utcDate,
    opponent: buildTeam({
      id: home === CLUB_ID ? away : home,
      crest: `https://crests.football-data.org/${home === CLUB_ID ? away : home}.png`,
    }),
    venue: home === CLUB_ID ? 'H' : 'A',
    competition: code,
    score: score ? (home === CLUB_ID ? score : [score[1], score[0]]) : undefined,
    overrides: { status },
  });
}

const response = (matches: Match[]) => buildMatches({ matches });

describe('club matches', () => {
  it('keeps the last five results, oldest first, from the club’s side', () => {
    const matches = toClubMatches(
      response([
        match('2026-10-20T19:00:00Z', 'FINISHED', CLUB_ID, 2, [0, 1]),
        match('2026-08-01T19:00:00Z', 'FINISHED', CLUB_ID, 3, [9, 9]), // sixth-newest, dropped
        match('2026-09-01T19:00:00Z', 'FINISHED', 4, CLUB_ID, [0, 2]),
        match('2026-09-10T19:00:00Z', 'FINISHED', CLUB_ID, 5, [1, 1]),
        match('2026-10-01T19:00:00Z', 'FINISHED', 6, CLUB_ID, [3, 1], 'CL'),
        match('2026-10-10T19:00:00Z', 'FINISHED', CLUB_ID, 7, [2, 0]),
      ]),
      CLUB_ID,
      1,
    );

    assert.deepEqual(
      matches.form.map((m) => [m.result, m.gf, m.ga, m.venue, m.opponent.id, m.competition]),
      [
        ['W', 2, 0, 'A', 4, 'PL'],
        ['D', 1, 1, 'H', 5, 'PL'],
        ['L', 1, 3, 'A', 6, 'CL'],
        ['W', 2, 0, 'H', 7, 'PL'],
        ['L', 0, 1, 'H', 2, 'PL'],
      ],
    );
    assert.deepEqual(matches.form[0]!.opponent, {
      id: 4,
      name: 'T4',
      tla: 'T4',
      crest: 'https://crests.football-data.org/4.png',
    });
  });

  it('lists the next four scheduled fixtures, soonest first, skipping postponed ones', () => {
    const matches = toClubMatches(
      response([
        match('2026-12-20T15:00:00Z', 'TIMED', CLUB_ID, 6),
        match('2026-11-20T15:00:00Z', 'POSTPONED', CLUB_ID, 9),
        match('2026-11-22T15:00:00Z', 'TIMED', 2, CLUB_ID),
        match('2026-12-01T15:00:00Z', 'SCHEDULED', CLUB_ID, 3),
        match('2026-12-10T15:00:00Z', 'TIMED', 4, CLUB_ID),
        match('2026-12-30T15:00:00Z', 'TIMED', CLUB_ID, 5),
      ]),
      CLUB_ID,
      1234,
    );

    assert.equal(matches.clubId, CLUB_ID);
    assert.equal(matches.fetchedAt, 1234);
    assert.deepEqual(
      matches.fixtures.map((f) => [f.utcDate.slice(0, 10), f.venue, f.opponent.id]),
      [
        ['2026-11-22', 'A', 2],
        ['2026-12-01', 'H', 3],
        ['2026-12-10', 'A', 4],
        ['2026-12-20', 'H', 6],
      ],
    );
  });
});
