import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { toTeamCard } from './team-card.ts';
import type { Match, MatchesResponse } from './types/api.ts';

const team = (id: number, shortName = `T${id}`) => ({
  id,
  name: `${shortName} FC`,
  shortName,
  tla: shortName.slice(0, 3).toUpperCase(),
  crest: `https://crests.example/${id}.png`,
});

function match(
  utcDate: string,
  status: Match['status'] | 'SCHEDULED',
  home: number,
  away: number,
  score: [number, number] | null = null,
  code = 'PL',
): Match {
  return {
    utcDate,
    status: status as Match['status'],
    homeTeam: team(home),
    awayTeam: team(away),
    competition: { id: 1, name: code, code, type: 'LEAGUE', emblem: '' },
    score: {
      winner: null,
      duration: 'REGULAR',
      fullTime: { home: score?.[0] ?? null, away: score?.[1] ?? null },
      halfTime: { home: null, away: null },
    },
  } as Match;
}

const response = (matches: Match[]) => ({ matches }) as MatchesResponse;

describe('team card', () => {
  it('keeps the last five results, oldest first, from the club’s side', () => {
    const card = toTeamCard(
      response([
        match('2026-10-20T19:00:00Z', 'FINISHED', 57, 2, [0, 1]),
        match('2026-08-01T19:00:00Z', 'FINISHED', 57, 3, [9, 9]), // sixth-newest, dropped
        match('2026-09-01T19:00:00Z', 'FINISHED', 4, 57, [0, 2]),
        match('2026-09-10T19:00:00Z', 'FINISHED', 57, 5, [1, 1]),
        match('2026-10-01T19:00:00Z', 'FINISHED', 6, 57, [3, 1], 'CL'),
        match('2026-10-10T19:00:00Z', 'FINISHED', 57, 7, [2, 0]),
      ]),
      57,
      1,
    );

    assert.deepEqual(
      card.form.map((m) => [m.result, m.gf, m.ga, m.venue, m.opponent.id, m.competition]),
      [
        ['W', 2, 0, 'A', 4, 'PL'],
        ['D', 1, 1, 'H', 5, 'PL'],
        ['L', 1, 3, 'A', 6, 'CL'],
        ['W', 2, 0, 'H', 7, 'PL'],
        ['L', 0, 1, 'H', 2, 'PL'],
      ],
    );
    assert.deepEqual(card.form[0]!.opponent, {
      id: 4,
      name: 'T4',
      tla: 'T4',
      crest: 'https://crests.example/4.png',
    });
  });

  it('lists the next four scheduled fixtures, soonest first, skipping postponed ones', () => {
    const card = toTeamCard(
      response([
        match('2026-12-20T15:00:00Z', 'TIMED', 57, 6),
        match('2026-11-20T15:00:00Z', 'POSTPONED', 57, 9),
        match('2026-11-22T15:00:00Z', 'TIMED', 2, 57),
        match('2026-12-01T15:00:00Z', 'SCHEDULED', 57, 3),
        match('2026-12-10T15:00:00Z', 'TIMED', 4, 57),
        match('2026-12-30T15:00:00Z', 'TIMED', 57, 5),
      ]),
      57,
      1234,
    );

    assert.equal(card.teamId, 57);
    assert.equal(card.fetchedAt, 1234);
    assert.deepEqual(
      card.fixtures.map((f) => [f.utcDate.slice(0, 10), f.venue, f.opponent.id]),
      [
        ['2026-11-22', 'A', 2],
        ['2026-12-01', 'H', 3],
        ['2026-12-10', 'A', 4],
        ['2026-12-20', 'H', 6],
      ],
    );
  });
});
