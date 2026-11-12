import { tryCatch } from './utils.ts';
import type { FootballDataCache } from './api-cache.ts';
import { clubSections, type ClubSection } from './clubs.ts';
import { isFresh } from './freshness.ts';
import { toClubMatches, type ClubMatches } from './club-matches.ts';
import { toMatchReport, type MatchReport } from './match-report.ts';

import type { MatchDetailResponse, MatchesResponse, StandingsResponse } from './types/api.ts';

export const RETRY_AFTER_MS = 60_000;

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
export type ClubMatchesResult =
  { status: 'ok'; matches: ClubMatches } | { status: 'not-tracked' } | { status: 'unavailable' };
export type MatchReportResult =
  | { status: 'ok'; report: MatchReport }
  | { status: 'not-found' }
  | { status: 'unavailable' };
export type TrackedCompetitions = {
  standings: StandingsResponse[];
  sections: ClubSection[];
  complete: boolean;
};

export type FootballData = {
  trackedCompetitions(): Promise<TrackedCompetitions>;
  clubMatches(clubId: number): Promise<ClubMatchesResult>;
  matchesForClubs(clubIds: number[], tracked: TrackedCompetitions): Promise<ClubMatches[]>;
  /** One of a tracked club's recent results in full. */
  matchReport(clubId: number, matchId: number): Promise<MatchReportResult>;
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

    if (cached && isFresh(cached.fetchedAt, now())) {
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

  async function matchesForTracked(clubId: number): Promise<ClubMatchesResult> {
    const result = await readThrough<MatchesResponse>(
      `matches-${clubId}`,
      `/v4/teams/${clubId}/matches`,
      'Failed to fetch matches',
    );
    return result.data
      ? { status: 'ok', matches: toClubMatches(result.data, clubId, result.fetchedAt) }
      : { status: 'unavailable' };
  }

  // A club can only be ruled out once every tracked competition's standings are in.
  async function trackedCompetitions(): Promise<TrackedCompetitions> {
    const all = await standings();
    return {
      standings: all,
      sections: clubSections(all),
      complete: all.length === Object.keys(COMPETITION_IDS).length,
    };
  }

  async function clubMatches(clubId: number): Promise<ClubMatchesResult> {
    const tracked = await trackedCompetitions();
    if (!tracked.sections.some((section) => section.clubs.some((club) => club.id === clubId))) {
      return { status: tracked.complete ? 'not-tracked' : 'unavailable' };
    }
    return matchesForTracked(clubId);
  }

  return {
    trackedCompetitions,
    clubMatches,
    async matchesForClubs(clubIds, tracked) {
      if (!clubIds.length) return [];
      const trackedIds = new Set(
        tracked.sections.flatMap((section) => section.clubs.map((club) => club.id)),
      );
      const results = await Promise.all(
        clubIds.filter((id) => trackedIds.has(id)).map(matchesForTracked),
      );
      return results.flatMap((result) => (result.status === 'ok' ? [result.matches] : []));
    },
    // Only a result the club card can show is fetched, so the route can't be used to spend the
    // rate limit on arbitrary match ids.
    async matchReport(clubId, matchId) {
      const club = await clubMatches(clubId);
      if (club.status === 'unavailable') return { status: 'unavailable' };
      if (club.status === 'not-tracked') return { status: 'not-found' };
      if (!club.matches.form.some((match) => match.id === matchId)) return { status: 'not-found' };
      const result = await readThrough<MatchDetailResponse>(
        `match-${matchId}`,
        `/v4/matches/${matchId}`,
        'Failed to fetch match',
      );
      if (!result.data) return { status: 'unavailable' };
      const report = toMatchReport(result.data, result.fetchedAt);
      return report ? { status: 'ok', report } : { status: 'not-found' };
    },
  };
}
