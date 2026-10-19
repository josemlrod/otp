import * as assert from 'remix/assert';
import { beforeAll, beforeEach, describe, it } from 'remix/test';

import { apiCache } from '../data/tables.ts';
import { db, migrateDatabase } from '../db.ts';
import { readCache, writeCache } from './api-cache.ts';
import { footballDataRepository } from './football-data-repository.ts';
import type { StandingsResponse } from './types/api.ts';

const competitionIds = [2021, 2002, 2019, 2014, 2015, 2001];

function standing(id: number): StandingsResponse {
  return {
    filters: { season: '2026' },
    area: { id: 2072, name: 'England', code: 'ENG', flag: '' },
    competition: {
      id,
      name: `Competition ${id}`,
      code: String(id),
      type: 'LEAGUE',
      emblem: '',
    },
    season: {
      id: 2502,
      startDate: '2026-08-21',
      endDate: '2027-05-30',
      currentMatchday: 7,
      winner: null,
    },
    standings: [{ stage: 'REGULAR_SEASON', type: 'TOTAL', group: null, table: [] }],
  };
}

describe('all competition standings', () => {
  beforeAll(() => migrateDatabase());
  beforeEach(async () => {
    await Promise.all(
      competitionIds.map((id) => db.delete(apiCache, `standings-${id}`)),
    );
  });

  it('fetches all six competitions concurrently and preserves their configured order', async (t) => {
    const pending = new Map<number, (response: Response) => void>();
    const requested = Promise.withResolvers<void>();
    t.mock.method(globalThis, 'fetch', (url: string) => {
      const id = Number(url.match(/\/competitions\/(\d+)\/standings$/)?.[1]);
      assert.ok(competitionIds.includes(id));
      return new Promise<Response>((resolve) => {
        pending.set(id, resolve);
        if (pending.size === competitionIds.length) requested.resolve();
      });
    });

    const result = footballDataRepository.fetchAllStandings();
    await requested.promise;
    for (const id of competitionIds.toReversed()) {
      pending.get(id)!(Response.json(standing(id)));
    }

    assert.deepEqual(await result, competitionIds.map(standing));
    for (const id of competitionIds) {
      assert.deepEqual((await readCache(`standings-${id}`))?.data, standing(id));
    }
  });

  it('uses fresh cached standings without calling the API', async (t) => {
    for (const id of competitionIds) {
      await writeCache(`standings-${id}`, standing(id));
    }
    const fetch = t.mock.method(globalThis, 'fetch', () => {
      throw new Error('Fresh standings should come from the cache');
    });

    assert.deepEqual(
      await footballDataRepository.fetchAllStandings(),
      competitionIds.map(standing),
    );
    assert.equal(fetch.mock.calls.length, 0);
  });

  it('refreshes expired standings and caches the new data', async (t) => {
    for (const id of competitionIds) {
      await writeCache(`standings-${id}`, standing(id), 0);
    }
    const updated = competitionIds.map((id) => ({ ...standing(id), standings: [] }));
    const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
      const id = Number(url.match(/\/competitions\/(\d+)\/standings$/)?.[1]);
      return Response.json(updated.find((response) => response.competition.id === id));
    });

    assert.deepEqual(await footballDataRepository.fetchAllStandings(), updated);
    assert.equal(fetch.mock.calls.length, competitionIds.length);
    for (const response of updated) {
      const cached = await readCache(`standings-${response.competition.id}`);
      assert.deepEqual(cached?.data, response);
      assert.ok(cached && cached.fetchedAt > 0);
    }
  });

  it('keeps successful competitions when others fail or return invalid JSON', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url: string) => {
      const id = Number(url.match(/\/competitions\/(\d+)\/standings$/)?.[1]);
      if (id === 2002) return new Response('Rate limited', { status: 429 });
      if (id === 2019) throw new Error('Network unavailable');
      if (id === 2015) return new Response('invalid JSON');
      return Response.json(standing(id));
    });

    assert.deepEqual(
      await footballDataRepository.fetchAllStandings(),
      [2021, 2014, 2001].map(standing),
    );
    for (const id of [2002, 2019, 2015]) {
      assert.equal(await readCache(`standings-${id}`), null);
    }
  });

  it('returns an empty array when all competitions fail without cached data', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));

    assert.deepEqual(await footballDataRepository.fetchAllStandings(), []);
  });

  it('falls back to stale standings when the API is rate limited', async (t) => {
    await writeCache('standings-2021', standing(2021), 0);
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));

    assert.deepEqual(await footballDataRepository.fetchAllStandings(), [standing(2021)]);
    assert.equal((await readCache('standings-2021'))?.fetchedAt, 0);
  });
});
