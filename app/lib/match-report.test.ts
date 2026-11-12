import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { buildMatch, buildMatchDetail, buildTeam } from '../fixtures/builders.ts';
import { toMatchReport } from './match-report.ts';

const arsenal = buildTeam({ id: 57, shortName: 'Arsenal' });
const liverpool = buildTeam({ id: 64, shortName: 'Liverpool' });
const finished = buildMatch(
  { result: 'W', score: [2, 1], opponent: liverpool, overrides: { id: 4242 } },
  arsenal,
);

describe('match report', () => {
  it('keeps only what the base plan sends: score, half time and referee', () => {
    const report = toMatchReport(
      buildMatchDetail(finished, { events: false, stats: false, odds: false }),
      1,
    );
    assert.ok(report);
    assert.deepEqual(report.fullTime, [2, 1]);
    assert.equal(report.events, null);
    assert.equal(report.stats, null);
    assert.equal(report.odds, null);
    assert.equal(report.referee, 'Anthony Taylor');
    assert.equal(report.home.name, 'Arsenal');
  });

  it('turns Deep Data into events in match order, goal first at a shared minute', () => {
    const report = toMatchReport(buildMatchDetail(finished), 1)!;
    const events = report.events!;
    assert.deepEqual(
      events.filter((e) => e.kind === 'goal').map((e) => e.kind === 'goal' && e.score),
      [[1, 0], [1, 1], [2, 1]],
    );
    const stamps = events.map((e) => e.minute * 100 + (e.injuryTime ?? 0));
    assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b));
    assert.ok(events.some((e) => e.kind === 'card' && e.minute === 45 && e.injuryTime === 2));
    assert.equal(events.filter((e) => e.kind === 'sub').length, 4);
  });

  it('maps statistics to pairs and odds to fair percentages', () => {
    const report = toMatchReport(buildMatchDetail(finished), 1)!;
    assert.deepEqual(report.stats?.possession, [56, 44]);
    assert.deepEqual(report.odds, [45, 26, 29]);
  });

  it('treats an empty goals list as a match with events and no goals', () => {
    const goalless = buildMatch({ result: 'D', score: [0, 0], opponent: liverpool }, arsenal);
    const report = toMatchReport(buildMatchDetail(goalless), 1)!;
    assert.ok(report.events);
    assert.equal(report.events.filter((e) => e.kind === 'goal').length, 0);
  });

  it('has no report for a match that is not finished', () => {
    assert.equal(toMatchReport({ ...buildMatchDetail(finished, { events: false }), status: 'TIMED' }, 1), null);
  });
});
