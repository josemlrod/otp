import { clubSections } from '../lib/clubs.ts';
import type { MatchesResponse } from '../lib/types/api.ts';

import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { NOW } from './builders.ts';
import { scenarioFetcher, scenarioNames } from './scenarios.ts';
import { createFootballData } from '../lib/football-data.ts';
import { createMemoryCache } from '../lib/api-cache.ts';
import { createAppRouter } from '../router.ts';

describe('dev scenarios', () => {
  for (const name of scenarioNames) {
    it(`${name} renders GET / successfully`, async () => {
      const footballData = createFootballData({
        fetcher: scenarioFetcher(name, NOW),
        cache: createMemoryCache(),
        now: () => NOW,
      });
      const router = createAppRouter({ footballData });
      const response = await router.fetch(
        new Request('http://localhost/', { headers: { Cookie: 'otp_follows=57.64.1903' } }),
      );
      assert.equal(response.status, 200);
      const html = await response.text();
      if (name === 'api-down') {
        assert.match(html, /Couldn't load your clubs right now/);
        assert.doesNotMatch(html, /Build your stack/);
      } else {
        assert.match(html, /Arsenal/);
        assert.match(html, /Liverpool/);
        assert.match(html, /Your clubs · 3/);
      }
    });
  }

  it('matchday provides all competitions, varied form and a kickoff within hours', async () => {
    const data = createFootballData({
      fetcher: scenarioFetcher('matchday', NOW),
      cache: createMemoryCache(),
      now: () => NOW,
    });
    assert.equal((await data.trackedCompetitions()).standings.length, 6);
    const cards = await data.matchesForClubs([57, 64], await data.trackedCompetitions());
    assert.equal(cards.length, 2);
    assert.notDeepEqual(
      cards[0].form.map((match) => match.result),
      cards[1].form.map((match) => match.result),
    );
    const kickoff = Date.parse(cards[0].fixtures[0].utcDate) - NOW;
    assert.ok(kickoff > 0 && kickoff < 4 * 3_600_000);
  });

  it('no-fixtures leaves a tracked club without upcoming fixtures', async () => {
    const data = createFootballData({
      fetcher: scenarioFetcher('no-fixtures', NOW),
      cache: createMemoryCache(),
      now: () => NOW,
    });
    const result = await data.clubMatches(57);
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') assert.deepEqual(result.matches.fixtures, []);
  });

  it('unknown API paths return 404', async () => {
    assert.equal((await scenarioFetcher('matchday', NOW)('/v4/teams/999/matches')).status, 404);
  });

  it('unknown scenario names list the valid choices', () => {
    assert.throws(
      () => scenarioFetcher('unknown', NOW),
      /Valid scenarios: matchday, api-down, no-fixtures/,
    );
  });
});

it('uses real club ids and puts only CL-only clubs in Rest of Europe', async () => {
  const data = createFootballData({
    fetcher: scenarioFetcher('matchday', NOW),
    cache: createMemoryCache(),
    now: () => NOW,
  });
  const standings = (await data.trackedCompetitions()).standings;
  const sections = clubSections(standings);
  assert.deepEqual(
    sections.find((section) => section.code === 'PL')?.clubs.map((club) => club.id),
    [57, 61, 64],
  );
  assert.deepEqual(
    sections.at(-1)?.clubs.map((club) => club.id),
    [678, 1903, 498],
  );
  const cl = standings.find((table) => table.competition.code === 'CL');
  assert.ok(cl?.standings[0].table.some((row) => row.team.id === 57));
});

it('uses opponents from each clubs competition and alternates venue', async () => {
  const fetcher = scenarioFetcher('matchday', NOW);
  const data = createFootballData({ fetcher, cache: createMemoryCache(), now: () => NOW });
  const standings = (await data.trackedCompetitions()).standings;
  for (const section of clubSections(standings)) {
    for (const club of section.clubs) {
      const response = await fetcher(`/v4/teams/${club.id}/matches`);
      const payload = (await response.json()) as MatchesResponse;
      const venues = payload.matches.map((match) => (match.homeTeam.id === club.id ? 'H' : 'A'));
      assert.deepEqual(venues, ['H', 'A', 'H', 'A', 'H', 'A', 'H', 'A']);
      for (const match of payload.matches) {
        const opponent = match.homeTeam.id === club.id ? match.awayTeam : match.homeTeam;
        const competition = standings.find(
          (table) => table.competition.code === match.competition.code,
        );
        assert.ok(competition?.standings[0].table.some((row) => row.team.id === opponent.id));
        assert.ok(opponent.id !== club.id);
      }
    }
  }
});
