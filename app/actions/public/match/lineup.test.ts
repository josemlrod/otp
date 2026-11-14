import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { NOW, buildLineups, buildMatchDetail, buildMatches, buildTeam } from '../../../fixtures/builders.ts';
import { toMatchReport } from '../../../lib/match-report.ts';
import { replayOf } from '../../../lib/match-replay.ts';
import { lineupOf, onHalf, ratingTone, roleOf } from './lineup.ts';

// Arsenal 2–1 Liverpool. Subs: Arsenal 11 → 12 at 62', Liverpool 10 → 13 at 66',
// Arsenal 9 → 14 at 75', Liverpool 8 → 15 at 84'. Player 12 shares player 1's name.
const arsenal = buildTeam({ id: 57, shortName: 'Arsenal' });
const liverpool = buildTeam({ id: 64, shortName: 'Liverpool' });
const [fixture] = buildMatches({
  club: arsenal,
  results: [{ result: 'W', score: [2, 1], opponent: liverpool, overrides: { id: 9000 } }],
}).matches;
const detail = buildMatchDetail(fixture!);
const report = { ...toMatchReport(detail, NOW)!, lineups: buildLineups(detail), bestPlayer: 5709 };
const replay = replayOf(report);

describe('lineup', () => {
  it('keeps the starting XI with their lines and spots on the half', () => {
    const home = lineupOf(report, replay, 'home')!;
    assert.equal(home.starters.length, 11);
    assert.deepEqual(home.starters.map((p) => p.role).join(','), 'GK,DEF,DEF,DEF,DEF,MID,MID,MID,FWD,FWD,FWD');
    const keeper = home.starters[0]!;
    assert.deepEqual(keeper.at, { x: 50, y: 88 });
    // The right back (FotMob x 0.125) stands on the right of the screen, the left back on the left.
    assert.equal(home.starters[1]!.at!.x, 92);
    assert.equal(home.starters[4]!.at!.x, 8);
    assert.equal(home.formation, '4-3-3');
    assert.equal(home.club.id, 57);
  });

  it('pairs substitutions with the players they replaced, even when names collide', () => {
    const home = lineupOf(report, replay, 'home')!;
    assert.deepEqual(home.used.map((p) => p.id), [5712, 5714]);
    const [first] = home.used;
    const off = home.starters.find((p) => p.id === 5711)!;
    assert.equal(first!.on, "62'");
    assert.equal(first!.replaced, off.short);
    assert.equal(off.replacedBy, first!.short);
    assert.equal(off.minutes, "Off 62'");
    assert.match(first!.minutes, /^On 62' · 28' played$/);
    assert.equal(home.starters[0]!.minutes, "90' played");
    assert.equal(home.unused.length, 5);
    assert.ok(home.unused.every((p) => p.minutes === 'Unused' && p.events.length === 0));
  });

  it('lists what a player did, in match order, with a point on the clock to jump to', () => {
    const away = lineupOf(report, replay, 'away')!;
    const subbed = away.starters.find((p) => p.id === 6410)!;
    assert.deepEqual(subbed.events.map((e) => [e.kind, e.text, e.label]), [
      ['goal', 'Goal', "51'"],
      ['off', 'Off for Costa', "66'"],
    ]);
    assert.ok(subbed.events[1]!.t! > replay!.half);

    const home = lineupOf(report, replay, 'home')!;
    const booked = home.starters.find((p) => p.id === 5704)!;
    assert.deepEqual(booked.events.map((e) => [e.kind, e.label]), [['yellow', "45+2'"]]);
    assert.equal(booked.captain, true);
    // The player of the match comes from the report.
    assert.equal(home.starters.find((p) => p.id === 5709)!.motm, true);
  });

  it('falls back to the lineup minutes when the report has no events', () => {
    const quiet = lineupOf({ ...report, events: null }, null, 'home')!;
    const off = quiet.starters.find((p) => p.id === 5711)!;
    assert.equal(off.minutes, "Off 62'");
    assert.equal(quiet.used[0]!.on, "62'");
    assert.equal(quiet.used[0]!.events.length, 0);
  });

  it('is null without lineups', () => {
    assert.equal(lineupOf({ ...report, lineups: null }, replay, 'home'), null);
  });

  it('maps ratings and heights to tones and lines', () => {
    assert.deepEqual([8.1, 7, 6.4, 5.9, null].map(ratingTone), ['top', 'good', 'ok', 'poor', 'none']);
    assert.deepEqual([0.1, 0.36, 0.55, 0.87].map(roleOf), ['GK', 'DEF', 'MID', 'FWD']);
    assert.deepEqual(onHalf({ x: 0, y: 2 }), { x: 92, y: 16 });
  });
});
