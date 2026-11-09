import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { buildMatches, buildStandings, buildTeam, NOW } from '../fixtures/builders.ts';
import { createMemoryCache } from './api-cache.ts';
import { createFootballData, RETRY_AFTER_MS, type FootballDataFetcher } from './football-data.ts';

const ids = [2021, 2002, 2019, 2014, 2015, 2001];
const teams = [buildTeam({ id: 57 }), buildTeam({ id: 58 }), buildTeam({ id: 59 })];
const standing = buildStandings('PL', { clubs: teams });
const HOUR = 3_600_000;

function setup(
  respond: FootballDataFetcher = async (path) => {
    if (path === '/v4/competitions/2021/standings') return Response.json(standing);
    const id = Number(path.match(/\/teams\/(\d+)\/matches$/)?.[1]);
    return id
      ? Response.json(buildMatches({ team: buildTeam({ id }), form: 'WDL' }))
      : new Response(null, { status: 404 });
  },
) {
  const calls: string[] = [];
  const cache = createMemoryCache();
  let time = NOW;
  const data = createFootballData({
    cache,
    now: () => time,
    fetcher: async (path) => {
      calls.push(path);
      return respond(path);
    },
  });
  return {
    data,
    cache,
    calls,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

async function cacheStandings(cache: ReturnType<typeof createMemoryCache>, fetchedAt = NOW) {
  for (const id of ids) await cache.write(`standings-${id}`, buildStandings(String(id)), fetchedAt);
}

describe('football data', () => {
  it('uses fresh cache without fetching', async () => {
    const { data, cache, calls } = setup();
    await cacheStandings(cache);
    assert.equal((await data.standings()).length, 6);
    assert.deepEqual(calls, []);
  });

  it('refetches at one hour and writes the new data and timestamp', async () => {
    const { data, cache, calls, advance } = setup();
    await cacheStandings(cache);
    advance(HOUR);
    assert.deepEqual(await data.standings(), [
      standing,
      ...ids.slice(1).map((id) => buildStandings(String(id))),
    ]);
    assert.equal(calls.length, 6);
    assert.deepEqual(await cache.read('standings-2021'), { data: standing, fetchedAt: NOW + HOUR });
  });

  for (const failure of ['network', 'invalid JSON', 'non-2xx']) {
    it(`serves stale data and skips missing copies on ${failure}`, async () => {
      const { data, cache } = setup(async () => {
        if (failure === 'network') throw new Error('offline');
        return new Response('invalid', { status: failure === 'non-2xx' ? 503 : 200 });
      });
      await cache.write('standings-2021', standing, NOW - HOUR);
      assert.deepEqual(await data.standings(), [standing]);
      assert.equal((await cache.read('standings-2021'))?.fetchedAt, NOW - HOUR);
      assert.equal(await cache.read('standings-2002'), null);
    });
  }

  it('rejects an untracked club without requesting matches', async () => {
    const { data, cache, calls } = setup();
    await cacheStandings(cache);
    assert.deepEqual(await data.clubCard(999), { status: 'not-tracked' });
    assert.ok(calls.every((path) => !path.includes('/teams/')));
  });

  it('reports an unknown club as unavailable while some standings are missing', async () => {
    const { data, calls } = setup();
    assert.deepEqual(await data.clubCard(999), { status: 'unavailable' });
    assert.ok(calls.every((path) => !path.includes('/teams/')));
  });

  it('reports unavailable when tracked matches fail without a copy', async () => {
    const { data, cache } = setup(async () => new Response(null, { status: 503 }));
    await cache.write('standings-2021', standing, NOW);
    assert.deepEqual(await data.clubCard(57), { status: 'unavailable' });
  });

  it('returns a projected card for a tracked club', async () => {
    const { data } = setup();
    const result = await data.clubCard(57);
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(result.card.teamId, 57);
      assert.equal(result.card.fetchedAt, NOW);
    }
  });

  it('keeps requested order and drops untracked and unavailable clubs', async () => {
    const { data } = setup(async (path) => {
      if (path.endsWith('/standings')) return Response.json(standing);
      if (path.includes('/59/')) return new Response(null, { status: 503 });
      const id = Number(path.split('/')[3]);
      return Response.json(buildMatches({ team: buildTeam({ id }) }));
    });
    assert.deepEqual(
      (await data.clubCards([58, 999, 59, 57])).map((card) => card.teamId),
      [58, 57],
    );
  });

  it('serves stale matches on failure with their original fetchedAt', async () => {
    const { data, cache } = setup(async () => new Response(null, { status: 503 }));
    await cache.write('standings-2021', standing, NOW);
    await cache.write('matches-57', buildMatches({ team: teams[0], form: 'WL' }), NOW - HOUR);
    const result = await data.clubCard(57);
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') assert.equal(result.card.fetchedAt, NOW - HOUR);
  });
});

describe('failure retry cooldown', () => {
  it('limits a cold outage to six calls across standings and club cards', async () => {
    const { data, calls, advance } = setup(async () => new Response(null, { status: 503 }));
    assert.deepEqual(await data.standings(), []);
    assert.deepEqual(await data.clubCards([57, 64]), []);
    assert.equal(calls.length, 6);
    calls.length = 0;
    assert.deepEqual(await data.clubCard(57), { status: 'unavailable' });
    assert.equal(calls.length, 0);
    advance(RETRY_AFTER_MS - 1);
    await data.standings();
    assert.equal(calls.length, 0);
    advance(1);
    await data.standings();
    assert.equal(calls.length, 6);
  });

  it('serves stale matches during cooldown and retries successfully at the boundary', async () => {
    let failing = true;
    const { data, cache, calls, advance } = setup(async (path) =>
      failing || path.endsWith('/standings')
        ? new Response(null, { status: 503 })
        : Response.json(buildMatches({ team: teams[0] })),
    );
    await cache.write('standings-2021', standing, NOW);
    await cacheStandings(cache);
    await cache.write('standings-2021', standing, NOW);
    await cache.write('matches-57', buildMatches({ team: teams[0] }), NOW - HOUR);
    await data.clubCard(57);
    calls.length = 0;
    const stale = await data.clubCard(57);
    assert.equal(stale.status, 'ok');
    if (stale.status === 'ok') {
      assert.equal(stale.card.fetchedAt, NOW - HOUR);
    }
    assert.equal(calls.length, 0);
    failing = false;
    advance(RETRY_AFTER_MS);
    const recovered = await data.clubCard(57);
    assert.equal(recovered.status, 'ok');
    assert.deepEqual(calls, ['/v4/teams/57/matches']);
    // Force an immediate cache miss to prove success removed the previous cooldown.
    await cache.write('matches-57', buildMatches(), NOW - HOUR);
    await data.clubCard(57);
    assert.equal(calls.length, 2);
  });

  it('keeps cooldown state local to each module instance', async () => {
    const fetcher = async () => new Response(null, { status: 503 });
    const first = setup(fetcher);
    const second = setup(fetcher);
    await first.data.standings();
    await second.data.standings();
    assert.equal(second.calls.length, 6);
  });
});
