import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import type { MatchReport, ReportEvent } from './match-report.ts';
import { replayOf, shortName } from './match-replay.ts';

const goal = (side: 'home' | 'away', minute: number, score: [number, number], extra: Partial<ReportEvent> = {}): ReportEvent => ({
  kind: 'goal', side, minute, injuryTime: null, goal: 'regular', player: 'Bukayo Saka', assist: 'Martin Ødegaard', score, ...extra,
} as ReportEvent);

function report(events: ReportEvent[] | null, overrides: Partial<MatchReport> = {}): MatchReport {
  return {
    id: 1, fetchedAt: 0, utcDate: '2026-11-08T16:30:00Z', competition: 'PL', competitionName: 'Premier League', matchday: 11,
    venue: null, attendance: null, referee: null,
    home: { id: 57, name: 'Arsenal', tla: 'ARS', crest: '' },
    away: { id: 64, name: 'Liverpool', tla: 'LIV', crest: '' },
    duration: 'REGULAR', fullTime: [2, 1], halfTime: [1, 0], injuryTime: 5, firstHalfInjuryTime: null,
    events, stats: null, odds: null, momentum: null, lineups: null, bestPlayer: null,
    ...overrides,
  };
}

// Arsenal 2–1 Liverpool: Saka 23', Salah 51', Havertz 78', a card at 45+2 and one at 90+3.
const events: ReportEvent[] = [
  goal('home', 23, [1, 0]),
  { kind: 'card', side: 'away', minute: 45, injuryTime: 2, card: 'yellow', player: 'Alexis Mac Allister' },
  goal('away', 51, [1, 1], { player: 'Mohamed Salah', assist: null }),
  { kind: 'card', side: 'home', minute: 70, injuryTime: null, card: 'red', player: 'Declan Rice' },
  goal('home', 78, [2, 1], { player: 'Kai Havertz', goal: 'penalty', assist: null }),
  { kind: 'card', side: 'away', minute: 90, injuryTime: 3, card: 'yellow', player: 'Virgil van Dijk' },
];

describe('match replay', () => {
  it('has nothing to replay without events', () => {
    assert.equal(replayOf(report(null)), null);
  });

  it('lays added time out in place on the clock', () => {
    const replay = replayOf(report(events))!;
    assert.equal(replay.half, 47);
    assert.equal(replay.end, 97);
    assert.equal(replay.label(46.2), "45+2'");
    assert.equal(replay.label(47.5), "46'");
    assert.equal(replay.label(96), "90+4'");
    assert.equal(replay.moments.find((m) => m.minute === 51)!.t, 53);
  });

  it('reads the score and time in front at any minute', () => {
    const replay = replayOf(report(events))!;
    assert.deepEqual(replay.scoreAt(22.9), [0, 0]);
    assert.deepEqual(replay.scoreAt(23), [1, 0]);
    assert.deepEqual(replay.scoreAt(60), [1, 1]);
    assert.deepEqual(replay.timeInFront(replay.end), [30 + 17, 0]);
  });

  it('captions the moment, then the state of the game', () => {
    const replay = replayOf(report(events))!;
    assert.equal(replay.captionAt(10), 'Goalless so far');
    assert.equal(replay.captionAt(24), 'Saka scores, from Ødegaard · 1–0');
    assert.equal(replay.captionAt(40), "Arsenal ahead since Saka’s 23'");
    assert.equal(replay.captionAt(62), "Level since Salah’s 51'");
    assert.equal(replay.captionAt(73), 'Rice sent off');
    assert.equal(replay.captionAt(81), 'Havertz scores a penalty · 2–1');
    assert.equal(replay.captionAt(replay.end), 'Arsenal led for 47 of 97 minutes');
  });

  it('says goalless at the whistle when no one scored', () => {
    const replay = replayOf(report([], { fullTime: [0, 0] }))!;
    assert.equal(replay.captionAt(replay.end), 'Goalless');
  });

  it('snaps a loose scrub to the nearest goal or card, never a substitution', () => {
    const replay = replayOf(report([...events, { kind: 'sub', side: 'home', minute: 62, injuryTime: null, playerIn: 'A B', playerOut: 'C D' }]))!;
    assert.equal(replay.snap(24), 23);
    assert.equal(replay.snap(64), null);
  });

  it('runs on into extra time', () => {
    const replay = replayOf(report([goal('home', 105, [1, 0])], { duration: 'EXTRA_TIME', injuryTime: 4 }))!;
    assert.equal(replay.end, 45 + 45 + 4 + 30);
    assert.equal(replay.label(replay.moments[0].t), "105'");
  });

  it('shortens names to the surname', () => {
    assert.equal(shortName('Virgil van Dijk'), 'van Dijk');
    assert.equal(shortName('Mata'), 'Mata');
  });
});
