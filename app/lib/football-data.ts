import { tryCatch } from './utils.ts';
import type { FootballDataCache } from './api-cache.ts';
import { clubSections } from './clubs.ts';
import { toTeamCard, type TeamCard } from './team-card.ts';

import type { MatchesResponse, StandingsResponse } from './types/api.ts';

export const RETRY_AFTER_MS = 60_000;

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

type FetchResult<T> = { data: T; err: null } | { data: null; err: string };
type CachedResult<T> = { data: T; err: null; fetchedAt: number } | { data: null; err: string };

export type FootballDataFetcher = (path: string) => Promise<Response>;
export type ClubCardResult =
  { status: 'ok'; card: TeamCard } | { status: 'not-tracked' } | { status: 'unavailable' };
export type FootballData = {
  standings(): Promise<StandingsResponse[]>;
  clubCard(clubId: number): Promise<ClubCardResult>;
  clubCards(clubIds: number[]): Promise<TeamCard[]>;
};

export function createFootballData({
  fetcher,
  cache,
  now,
}: {
  fetcher: FootballDataFetcher;
  cache: FootballDataCache;
  now: () => number;
}): FootballData {
  const retryAt = new Map<string, number>();

  async function fetchFootballData<T>(path: string, errorMessage: string): Promise<FetchResult<T>> {
    const start = now();
    const [response, err] = await tryCatch(fetcher(path));
    const ms = Math.round(now() - start);

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
    const [cached, readErr] = await tryCatch(cache.read<T>(key));
    if (readErr) logError(`cache read failed ${key}`, readErr);

    if (cached && now() - cached.fetchedAt < MAX_AGE_MS) {
      log(`cache hit ${key}`);
      return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
    }
    log(`${cached ? 'cache stale' : 'cache miss'} ${key}`);

    const coolingDown = now() < (retryAt.get(key) ?? -Infinity);
    if (coolingDown) log(`retry cooldown ${key}`);
    const res: FetchResult<T> = coolingDown
      ? { data: null, err: errorMessage }
      : await fetchFootballData<T>(path, errorMessage);
    if (res.data) {
      retryAt.delete(key);
      const fetchedAt = now();
      const [, writeErr] = await tryCatch(cache.write(key, res.data, fetchedAt));
      if (writeErr) logError(`cache write failed ${key}`, writeErr);
      return { data: res.data, err: null, fetchedAt };
    }

    if (!retryAt.has(key) || now() >= retryAt.get(key)!) {
      retryAt.set(key, now() + RETRY_AFTER_MS);
    }

    if (cached) {
      log(`serving stale ${key}`);
      return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
    }

    return { data: null, err: res.err ?? errorMessage };
  }

  async function standings(): Promise<StandingsResponse[]> {
    const results = await Promise.all(
      Object.values(COMPETITION_IDS).map((id) =>
        readThrough<StandingsResponse>(
          `standings-${id}`,
          `/v4/competitions/${id}/standings`,
          'Failed to fetch standings',
        ),
      ),
    );
    return results.flatMap(({ data }) => (data ? [data] : []));
  }

  async function cardForTracked(clubId: number): Promise<ClubCardResult> {
    const result = await readThrough<MatchesResponse>(
      `matches-${clubId}`,
      `/v4/teams/${clubId}/matches`,
      'Failed to fetch matches',
    );
    return result.data
      ? { status: 'ok', card: toTeamCard(result.data, clubId, result.fetchedAt) }
      : { status: 'unavailable' };
  }

  // A club can only be ruled out once every tracked competition's standings are in.
  async function trackedClubs() {
    const all = await standings();
    const ids = new Set(
      clubSections(all).flatMap((section) => section.clubs.map((club) => club.id)),
    );
    return { ids, complete: all.length === Object.keys(COMPETITION_IDS).length };
  }

  return {
    standings,
    async clubCard(clubId) {
      const tracked = await trackedClubs();
      if (!tracked.ids.has(clubId)) {
        return { status: tracked.complete ? 'not-tracked' : 'unavailable' };
      }
      return cardForTracked(clubId);
    },
    async clubCards(clubIds) {
      if (!clubIds.length) return [];
      const tracked = (await trackedClubs()).ids;
      const results = await Promise.all(
        clubIds.filter((id) => tracked.has(id)).map(cardForTracked),
      );
      return results.flatMap((result) => (result.status === 'ok' ? [result.card] : []));
    },
  };
}
