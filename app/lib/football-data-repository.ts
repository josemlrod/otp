import { tryCatch } from './utils.ts';
import { readCache, writeCache } from './api-cache.ts';
import { toTeamCard, type TeamCard } from './team-card.ts';

import type { MatchesResponse, StandingsResponse } from './types/api.ts';

const FOOTBALL_DATA_API_DOMAIN = 'https://api.football-data.org';
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? '';
const MAX_AGE_MS = 60 * 60 * 1000;
const COMPETITION_IDS = {
  PL: 2021,
  BL1: 2002,
  SA: 2019,
  PD: 2014,
  FL1: 2015,
  CL: 2001,
};

function log(message: string) {
  console.info(`[football-data] ${message}`);
}

function logError(message: string, err?: unknown) {
  if (err === undefined) console.error(`[football-data] ${message}`);
  else console.error(`[football-data] ${message}`, err);
}

function authHeaders() {
  return { 'X-Auth-Token': FOOTBALL_DATA_API_KEY };
}

type FetchResult<T> = { data: T; err: null } | { data: null; err: string };
type CachedResult<T> =
  | { data: T; err: null; fetchedAt: number }
  | { data: null; err: string };

async function fetchFootballData<T>(
  path: string,
  errorMessage: string,
): Promise<FetchResult<T>> {
  const url = `${FOOTBALL_DATA_API_DOMAIN}${path}`;
  const start = performance.now();
  const [response, err] = await tryCatch(
    fetch(url, {
      headers: authHeaders(),
    }),
  );
  const ms = Math.round(performance.now() - start);

  if (err) {
    logError(`GET ${path} failed after ${ms}ms`, err);
    return { data: null, err: errorMessage };
  }

  if (!response.ok) {
    logError(`GET ${path} ${response.status} ${ms}ms`);
    return { data: null, err: errorMessage };
  }
  log(`GET ${path} ${response.status} ${ms}ms`);

  const [data, parseErr] = await tryCatch(response.json() as Promise<T>);
  if (parseErr) {
    logError(`GET ${path} returned invalid JSON`, parseErr);
    return { data: null, err: errorMessage };
  }

  return { data, err: null };
}

async function readThrough<T>(
  key: string,
  path: string,
  errorMessage: string,
): Promise<CachedResult<T>> {
  const [cached, readErr] = await tryCatch(readCache<T>(key));
  if (readErr) logError(`cache read failed ${key}`, readErr);

  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) {
    log(`cache hit ${key}`);
    return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
  }
  log(`${cached ? 'cache stale' : 'cache miss'} ${key}`);

  const res = await fetchFootballData<T>(path, errorMessage);
  if (res.data) {
    const fetchedAt = Date.now();
    const [, writeErr] = await tryCatch(writeCache(key, res.data, fetchedAt));
    if (writeErr) logError(`cache write failed ${key}`, writeErr);
    return { data: res.data, err: null, fetchedAt };
  }

  if (cached) {
    log(`serving stale ${key}`);
    return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
  }

  return { data: null, err: res.err ?? errorMessage };
}

export const footballDataRepository = {
  async fetchStandings(competitionId: number) {
    return readThrough<StandingsResponse>(
      `standings-${competitionId}`,
      `/v4/competitions/${competitionId}/standings`,
      'Failed to fetch standings',
    );
  },

  async fetchAllStandings(): Promise<StandingsResponse[]> {
    const results = await Promise.all(
      Object.values(COMPETITION_IDS).map((competitionId) =>
        footballDataRepository.fetchStandings(competitionId),
      ),
    );

    return results.flatMap(({ data }) => (data ? [data] : []));
  },

  async fetchTeamMatches(teamId: number) {
    return readThrough<MatchesResponse>(
      `matches-${teamId}`,
      `/v4/teams/${teamId}/matches`,
      'Failed to fetch matches',
    );
  },

  async fetchTeamCard(teamId: number) {
    const res = await footballDataRepository.fetchTeamMatches(teamId);
    return res.data ? toTeamCard(res.data, teamId, res.fetchedAt) : null;
  },

  async fetchAllTeamCards(teamIds: number[]): Promise<TeamCard[]> {
    const cards = await Promise.all(
      teamIds.map((id) => footballDataRepository.fetchTeamCard(id)),
    );

    return cards.flatMap((card) => (card ? [card] : []));
  },
};
