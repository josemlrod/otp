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

function competitionIdFrom(url: string) {
  return Number(url.match(/\/competitions\/(\d+)\/standings$/)?.[1]);
}

describe('all competition standings', () => {
  beforeAll(() => migrateDatabase());
  beforeEach(async () => {
    await Promise.all(
      competitionIds.map((id) => db.delete(apiCache, `standings-${id}`)),
    );
  });

  it('fetches missing and expired standings and caches them', async (t) => {
    await writeCache('standings-2021', { ...standing(2021), standings: [] }, 0);
    const fetch = t.mock.method(globalThis, 'fetch', async (url: string) =>
      Response.json(standing(competitionIdFrom(url))),
    );

    assert.deepEqual(
      await footballDataRepository.fetchAllStandings(),
      competitionIds.map(standing),
    );
    assert.equal(fetch.mock.calls.length, competitionIds.length);
    const cached = await readCache('standings-2021');
    assert.deepEqual(cached?.data, standing(2021));
    assert.ok(cached && cached.fetchedAt > 0);
  });

  it('uses fresh cached standings without calling the API', async (t) => {
    for (const id of competitionIds) {
      await writeCache(`standings-${id}`, standing(id));
    }
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}));

    assert.deepEqual(
      await footballDataRepository.fetchAllStandings(),
      competitionIds.map(standing),
    );
    assert.equal(fetch.mock.calls.length, 0);
  });

  it('falls back to stale standings and skips failed competitions without them', async (t) => {
    await writeCache('standings-2021', standing(2021), 0);
    t.mock.method(globalThis, 'fetch', async (url: string) => {
      const id = competitionIdFrom(url);
      if (id === 2002) throw new Error('Network unavailable');
      if (id === 2019) return new Response('invalid JSON');
      if (id === 2014) return Response.json(standing(id));
      return new Response(null, { status: 429 });
    });

    assert.deepEqual(
      await footballDataRepository.fetchAllStandings(),
      [standing(2021), standing(2014)],
    );
    assert.equal((await readCache('standings-2021'))?.fetchedAt, 0);
    assert.equal(await readCache('standings-2002'), null);
  });
});
