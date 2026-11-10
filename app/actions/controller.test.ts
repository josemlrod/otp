import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import {
  buildTeam,
  buildStandings,
  buildMatches,
  buildClubMatches,
  NOW,
} from '../fixtures/builders.ts';
import { createMemoryCache } from '../lib/api-cache.ts';
import { createFootballData, type FootballDataFetcher } from '../lib/football-data.ts';
import { scenarioFetcher } from '../fixtures/scenarios.ts';
import { createAppRouter } from '../router.ts';

// Every tracked competition answers, so an unknown id is reliably 'not tracked'.
const TRACKED_CODES: Record<string, string> = {
  2021: 'PL',
  2002: 'BL1',
  2019: 'SA',
  2014: 'PD',
  2015: 'FL1',
  2001: 'CL',
};

function setup(unavailable = false) {
  const calls: string[] = [];
  const fetcher: FootballDataFetcher = async (path) => {
    calls.push(path);
    if (path === '/v4/competitions/2021/standings') {
      return Response.json(
        buildStandings('PL', { clubs: [buildTeam({ id: 57, shortName: 'Arsenal' })] }),
      );
    }
    const competition = path.match(/^\/v4\/competitions\/(\d+)\/standings$/)?.[1];
    if (competition) {
      return Response.json(buildStandings(TRACKED_CODES[competition]!));
    }
    if (path === '/v4/teams/57/matches' && !unavailable) {
      return Response.json(buildMatches({ form: 'WDL', fixtures: [2] }));
    }
    return new Response(null, { status: 503 });
  };
  const footballData = createFootballData({ fetcher, cache: createMemoryCache(), now: () => NOW });
  return { router: createAppRouter({ footballData, clock: { now: () => NOW, pinned: false } }), calls };
}

describe('root controller', () => {
  it('GET / fetches each tracked competition once on a cold cache', async () => {
    const { router, calls } = setup();
    const response = await router.fetch(
      new Request('http://localhost/', { headers: { Cookie: 'otp_follows=57.5' } }),
    );
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(
      calls.filter((path) => path.endsWith('/standings')).sort(),
      Object.keys(TRACKED_CODES)
        .map((id) => `/v4/competitions/${id}/standings`)
        .sort(),
    );
  });

  it('GET / renders standings for multiple competitions', async () => {
    const { router } = setup();
    const response = await router.fetch('http://localhost/');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Premier League/);
    assert.match(html, /La Liga/);
    assert.match(html, /Build your stack/);
  });

  it('GET / swaps the empty state for a count when the Your clubs cookie names tracked clubs', async () => {
    const { router, calls } = setup();
    const response = await router.fetch(
      new Request('http://localhost/', { headers: { Cookie: 'otp_follows=57.999' } }),
    );
    const html = await response.text();
    assert.match(html, /Your clubs · 1/);
    assert.doesNotMatch(html, /Build your stack/);
    assert.deepEqual(
      calls.filter((path) => path.includes('/teams/')),
      ['/v4/teams/57/matches'],
    );
  });

  for (const id of ['abc', '0', '-3', '1.5', '1e2']) {
    it(`GET matches rejects invalid id ${id} before any fetch`, async () => {
      const { router, calls } = setup();
      assert.equal((await router.fetch(`http://localhost/api/clubs/${id}/matches`)).status, 404);
      assert.deepEqual(calls, []);
    });
  }

  it('GET matches rejects untracked clubs without a matches request', async () => {
    const { router, calls } = setup();
    assert.equal((await router.fetch('http://localhost/api/clubs/999/matches')).status, 404);
    assert.deepEqual(
      calls.filter((path) => path.includes('/teams/')),
      [],
    );
  });

  it('GET matches returns 502 for unavailable club data', async () => {
    const { router } = setup(true);
    assert.equal((await router.fetch('http://localhost/api/clubs/57/matches')).status, 502);
  });

  it('GET matches returns club matches as JSON', async () => {
    const { router } = setup();
    const response = await router.fetch('http://localhost/api/clubs/57/matches');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
    assert.deepEqual(await response.json(), buildClubMatches({ form: 'WDL', fixtures: [2] }));
  });
});

for (const scenario of ['api-down', 'league-down', 'matchday']) {
  it(`${scenario} renders saved Your clubs without setting a cookie`, async () => {
    const calls: string[] = [];
    const fetcher = scenarioFetcher(scenario, NOW);
    const footballData = createFootballData({
      fetcher: (path) => {
        calls.push(path);
        return fetcher(path);
      },
      cache: createMemoryCache(),
      now: () => NOW,
    });
    const response = await createAppRouter({ footballData }).fetch(
      new Request('http://localhost/', { headers: { Cookie: 'otp_follows=57.5' } }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Set-Cookie'), null);
    const html = await response.text();
    assert.doesNotMatch(html, /Build your stack/);
    if (scenario === 'api-down') {
      assert.match(html, /Your clubs/);
      assert.match(html, /Couldn't load your clubs right now/);
      assert.doesNotMatch(html, />Edit</);
    } else {
      assert.match(html, /Arsenal/);
      assert.match(html, scenario === 'league-down' ? /Your clubs · 1/ : /Your clubs · 2/);
    }
    assert.deepEqual(
      calls.filter((path) => path.includes('/teams/')),
      scenario === 'api-down'
        ? []
        : scenario === 'league-down'
          ? ['/v4/teams/57/matches']
          : ['/v4/teams/57/matches', '/v4/teams/5/matches'],
    );
    assert.equal(calls.filter((path) => path.includes('/standings')).length, 6);
  });
}

it('renders and serializes one fixed clock using a validated timezone cookie', async () => {
  for (const [zone, expectedTime, expectedZone] of [
    ['Europe/Madrid', '13:00', 'Europe/Madrid'],
    ['bad-zone', '12:00', 'UTC'],
  ]) {
    const { router } = setup();
    const response = await router.fetch(new Request('http://localhost/', {
      headers: { Cookie: `otp_follows=57; otp_tz=${zone}` },
    }));
    const html = await response.text();
    assert.match(html, /Sunday 8 November/);
    assert.ok(html.includes(expectedTime!));
    assert.ok(html.includes(`"now":${NOW}`));
    assert.ok(html.includes(`"timeZone":"${expectedZone}"`));
  }
});
