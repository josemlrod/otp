import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { buildMatch, buildMatchDetail, buildTeam, NOW } from '../fixtures/builders.ts';
import { createMemoryCache } from './api-cache.ts';
import {
  createFotMob,
  findMatch,
  nameTokens,
  withFotMob,
  type FmDay,
  type FmEvent,
  type FmMatch,
  type FmPlayer,
} from './fotmob.ts';
import { toMatchReport } from './match-report.ts';

const brighton = buildTeam({ id: 397, name: 'Brighton & Hove Albion FC', shortName: 'Brighton Hove' });
const brentford = buildTeam({ id: 402, name: 'Brentford FC', shortName: 'Brentford' });
const fdMatch = buildMatch(
  {
    result: 'W',
    score: [2, 0],
    opponent: brentford,
    venue: 'H',
    overrides: { id: 77, utcDate: '2026-11-08T14:00:00Z' },
  },
  brighton,
);
const detail = buildMatchDetail(fdMatch, { events: false, stats: false, odds: false });
const base = toMatchReport(detail, NOW)!;

const listed = (id: number, home: string, away: string, utcTime = '2026-11-08T14:00:00.000Z') => ({
  id,
  home: { id: id * 10, name: home },
  away: { id: id * 10 + 1, name: away },
  status: { utcTime, finished: true },
});

const day: FmDay = {
  leagues: [
    { id: 47, matches: [listed(1, 'Crystal Palace', 'Liverpool'), listed(2, 'Brighton & Hove Albion', 'Brentford')] },
    { id: 48, matches: [listed(3, 'Brighton & Hove Albion', 'Brentford')] },
  ],
};

const fdKey = {
  utcDate: '2026-11-08T14:00:00Z',
  competition: 'PL',
  home: ['Brighton & Hove Albion FC', 'Brighton Hove'],
  away: ['Brentford FC', 'Brentford'],
};

const fmPlayer = (id: number, name: string, extra: Partial<FmPlayer> = {}): FmPlayer => ({
  id,
  name,
  shirtNumber: String(id % 30),
  verticalLayout: { x: 0.5, y: 0.1 },
  performance: { rating: 7 },
  ...extra,
});

function fmMatch(events: FmEvent[], overrides: Partial<NonNullable<FmMatch['content']>> = {}): FmMatch {
  return {
    general: { finished: true },
    content: {
      matchFacts: {
        events: { events },
        infoBox: { Stadium: { name: 'American Express Stadium' }, Attendance: 31629 },
        playerOfTheMatch: { id: 2 },
      },
      stats: {
        Periods: {
          All: {
            stats: [
              {
                stats: [
                  { key: 'BallPossesion', stats: [75, 25] },
                  { key: 'expected_goals', stats: ['2.11', '0.59'] },
                  { key: 'total_shots', stats: [20, 5] },
                ],
              },
              { stats: [{ key: 'total_shots', stats: [99, 99] }, { key: 'keeper_saves', stats: [0, 4] }] },
            ],
          },
        },
      },
      lineup: {
        lineupType: 'standard',
        homeTeam: {
          formation: '4-2-3-1',
          coach: { name: 'Fabian Hürzeler' },
          starters: [
            fmPlayer(1, 'Bart Verbruggen'),
            fmPlayer(2, 'Pascal Groß', {
              isCaptain: true,
              performance: { rating: 8.8, events: [{ type: 'goal' }, { type: 'assist' }, { type: 'yellowCard' }] },
            }),
          ],
          subs: [
            fmPlayer(3, 'Mats Wieffer', {
              performance: { rating: 6.3, substitutionEvents: [{ time: 46, type: 'subIn' }] },
            }),
          ],
        },
        awayTeam: {
          formation: '3-5-2',
          starters: [fmPlayer(4, 'Igor Thiago', { performance: { events: [{ type: 'redCard' }] } })],
          subs: [],
        },
      },
      momentum: { main: { data: [{ minute: 0, value: 0 }, { minute: 45.5, value: 30 }, { minute: 90, value: -12 }] } },
      ...overrides,
    },
  };
}

const events: FmEvent[] = [
  { type: 'Card', time: 5, isHome: false, card: 'Yellow', player: { name: 'Kristoffer Ajer' } },
  { type: 'Goal', time: 15, isHome: true, player: { name: 'Diego Gómez' }, newScore: [1, 0], assistPlayerId: 2, assistStr: 'assist by P. Groß' },
  { type: 'Card', time: 23, isHome: false, card: 'YellowRed', player: { name: 'Igor Thiago' } },
  // An own goal by a Brentford player counts for Brighton.
  { type: 'Goal', time: 42, isHome: false, ownGoal: true, player: { name: 'Nathan Collins' }, newScore: [2, 0] },
  { type: 'AddedTime', time: 45, minutesAddedInput: 4 },
  { type: 'Half', time: 45 },
  { type: 'Substitution', time: 46, overloadTime: 0, isHome: true, swap: [{ name: 'Mats Wieffer' }, { name: 'Chema Andrés' }] },
  { type: 'AddedTime', time: 90, minutesAddedInput: 5 },
  { type: 'Goal', time: 90, overloadTime: 5, isHome: false, player: { name: 'Igor Thiago' }, goalDescriptionKey: 'penalty', newScore: [2, 1], assistStr: 'assist by Mikkel Damsgaard' },
];

describe('fotmob: finding the match', () => {
  it('reduces club names to the words that tell them apart', () => {
    assert.deepEqual(nameTokens('Club Atlético de Madrid'), ['atletico', 'madrid']);
    assert.deepEqual(nameTokens('Brighton & Hove Albion FC'), ['brighton', 'and', 'hove', 'albion']);
  });

  it('picks the match in the same league, at the same kickoff, with the same clubs', () => {
    assert.equal(findMatch(day, fdKey)?.id, 2);
  });

  it("uses a league's primary id, as FotMob's Bundesliga carries a season id", () => {
    const bundesliga: FmDay = { leagues: [{ id: 1000005083, primaryId: 54, matches: [listed(9, '1. FC Köln', 'Bayer Leverkusen')] }] };
    const key = { utcDate: '2026-11-08T14:00:00Z', competition: 'BL1', home: ['1. FC Köln', 'Köln'], away: ['Bayer 04 Leverkusen', 'Leverkusen'] };
    assert.equal(findMatch(bundesliga, key)?.id, 9);
  });

  it('finds nothing on another day or between other clubs', () => {
    const other: FmDay = { leagues: [{ id: 47, matches: [listed(2, 'Brighton & Hove Albion', 'Brentford', '2026-11-09T14:00:00.000Z')] }] };
    assert.equal(findMatch(other, fdKey), null);
    assert.equal(findMatch(day, { ...fdKey, home: ['Arsenal FC'], away: ['Chelsea FC'] }), null);
  });
});

describe('fotmob: the report', () => {
  const report = withFotMob(base, fmMatch(events));

  it('turns events into goals with assists, cards and subs in match order', () => {
    const goals = report.events!.filter((e) => e.kind === 'goal');
    assert.deepEqual(
      goals.map((g) => g.kind === 'goal' && [g.side, g.goal, g.player, g.assist, g.score]),
      [
        ['home', 'regular', 'Diego Gómez', 'Pascal Groß', [1, 0]],
        ['home', 'own', 'Nathan Collins', null, [2, 0]],
        ['away', 'penalty', 'Igor Thiago', 'Mikkel Damsgaard', [2, 1]],
      ],
    );
    assert.deepEqual(
      report.events!.filter((e) => e.kind === 'card').map((e) => e.kind === 'card' && e.card),
      ['yellow', 'second-yellow'],
    );
    const sub = report.events!.find((e) => e.kind === 'sub');
    assert.deepEqual(sub, { kind: 'sub', side: 'home', minute: 46, injuryTime: null, playerIn: 'Mats Wieffer', playerOut: 'Chema Andrés' });
    assert.equal(report.events!.at(-1)?.injuryTime, 5);
  });

  it('takes added time from the announcements', () => {
    assert.equal(report.firstHalfInjuryTime, 4);
    assert.equal(report.injuryTime, 5);
  });

  it('reads stats as numbers, the first time each appears', () => {
    assert.deepEqual(report.stats, { possession: [75, 25], xg: [2.11, 0.59], shots: [20, 5], saves: [0, 4] });
  });

  it('keeps lineups with ratings, cards, goals and substitutions', () => {
    const home = report.lineups!.home;
    assert.equal(home.formation, '4-2-3-1');
    assert.equal(home.coach, 'Fabian Hürzeler');
    assert.deepEqual(home.starters[1], {
      id: 2, name: 'Pascal Groß', shirt: '2', rating: 8.8, captain: true, spot: { x: 0.5, y: 0.1 },
      on: null, off: null, goals: 1, assists: 1, card: 'yellow',
    });
    assert.equal(home.subs[0].on, 46);
    assert.equal(home.subs[0].spot, null);
    assert.equal(report.lineups!.away.starters[0].card, 'red');
    assert.equal(report.bestPlayer, 2);
  });

  it('keeps momentum, venue and attendance, and the score from football-data', () => {
    assert.deepEqual(report.momentum?.map((p) => p.minute), [0, 45.5, 90]);
    assert.equal(report.attendance, 31629);
    assert.equal(report.venue, base.venue ?? 'American Express Stadium');
    assert.deepEqual(report.fullTime, base.fullTime);
  });

  it('leaves the report alone for a match FotMob has not finished', () => {
    assert.equal(withFotMob(base, { ...fmMatch(events), general: { finished: false } }), base);
  });

  it('keeps what football-data had when FotMob has no events or stats', () => {
    const deep = toMatchReport(buildMatchDetail(fdMatch), NOW)!;
    const thin = withFotMob(deep, { general: { finished: true }, content: {} });
    assert.deepEqual(thin.events, deep.events);
    assert.deepEqual(thin.stats, deep.stats);
    assert.equal(thin.lineups, null);
  });
});

describe('fotmob: the source', () => {
  function setup(respond: (path: string) => Response) {
    const calls: string[] = [];
    const fotmob = createFotMob({
      cache: createMemoryCache(),
      now: () => NOW,
      fetcher: async (path) => {
        calls.push(path);
        return respond(path);
      },
    });
    return { fotmob, calls };
  }

  it("looks the match up in its kickoff day's list, then fetches it once", async () => {
    const { fotmob, calls } = setup((path) =>
      path.startsWith('/api/data/matches') ? Response.json(day) : Response.json(fmMatch(events)),
    );
    const report = await fotmob.enrich(detail, base);
    assert.equal(report.lineups?.home.formation, '4-2-3-1');
    await fotmob.enrich(detail, base);
    assert.deepEqual(calls, ['/api/data/matches?date=20261108', '/api/data/matchDetails?matchId=2']);
  });

  it('tries the next day, where a late kickoff lands in FotMob\'s timezone', async () => {
    const { fotmob, calls } = setup((path) =>
      path.endsWith('date=20261109')
        ? Response.json(day)
        : path.startsWith('/api/data/matches')
          ? Response.json({ leagues: [] })
          : Response.json(fmMatch(events)),
    );
    assert.ok((await fotmob.enrich(detail, base)).lineups);
    assert.deepEqual(calls.slice(0, 2), ['/api/data/matches?date=20261108', '/api/data/matches?date=20261109']);
  });

  it('returns the report unchanged when FotMob is down', async () => {
    const { fotmob, calls } = setup(() => new Response(null, { status: 503 }));
    assert.equal(await fotmob.enrich(detail, base), base);
    assert.equal(calls.length, 1);
  });
});
