import { tryCatch } from './utils.ts';
import { readCache, writeCache } from './file-cache.ts';

import type { StandingsResponse } from './types/api.ts';

const FOOTBALL_DATA_API_DOMAIN = 'https://api.football-data.org';
const FOOTBALL_DATA_API_KEY = '764b92b7607b4faa80c9320f27c879d2';

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

  if (err) return { data: null, err: errorMessage };

  const data = (await response.json()) as T;
  return { data, err: null };
}

export const footballDataRepository = {
  async fetchStandings(competitionId: number) {
    const key = `standings-${competitionId}`;
    const [cached] = await tryCatch(readCache(key));
    if (cached) return { data: cached, err: null };

    const [res] = await tryCatch(
      fetchFootballData<StandingsResponse>(
        `/v4/competitions/${competitionId}/standings`,
        'Failed to fetch standings',
      ),
    );
    if (res?.data) {
      await writeCache(key, res.data);
      return { data: res.data, err: null };
    }
  },
};
