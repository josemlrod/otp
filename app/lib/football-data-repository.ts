import { tryCatch } from './utils.ts';
import { readCache, writeCache } from './api-cache.ts';

import type { StandingsResponse } from './types/api.ts';

const FOOTBALL_DATA_API_DOMAIN = 'https://api.football-data.org';
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? '';
const STANDINGS_MAX_AGE_MS = 60 * 60 * 1000;

function authHeaders() {
  return { 'X-Auth-Token': FOOTBALL_DATA_API_KEY };
}

async function fetchFootballData<T>(path: string, errorMessage: string) {
  const url = `${FOOTBALL_DATA_API_DOMAIN}${path}`;
  const [response, err] = await tryCatch(
    fetch(url, {
      headers: authHeaders(),
    }),
  );

  if (err || !response.ok) return { data: null, err: errorMessage };

  const data = (await response.json()) as T;
  return { data, err: null };
}

export const footballDataRepository = {
  async fetchStandings(competitionId: number) {
    const key = `standings-${competitionId}`;
    const [cached] = await tryCatch(readCache<StandingsResponse>(key));
    if (cached && Date.now() - cached.fetchedAt < STANDINGS_MAX_AGE_MS) {
      return { data: cached.data, err: null };
    }

    const [res] = await tryCatch(
      fetchFootballData<StandingsResponse>(
        `/v4/competitions/${competitionId}/standings`,
        'Failed to fetch standings',
      ),
    );
    if (res?.data) {
      await tryCatch(writeCache(key, res.data));
      return { data: res.data, err: null };
    }

    // Stale standings beat an empty page when football-data is down or rate limiting us
    if (cached) return { data: cached.data, err: null };

    return { data: null, err: res?.err ?? 'Failed to fetch standings' };
  },
};
