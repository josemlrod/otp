import { tryCatch } from './utils.ts';
import type { FootballDataCache } from './api-cache.ts';
import { clubSections, type ClubSection } from './clubs.ts';
import { toClubMatches, type ClubMatches } from './club-matches.ts';
import { toMatchReport, type MatchReport } from './match-report.ts';
import { createReadThrough, type Fetcher } from './read-through.ts';

import type { MatchDetailResponse, MatchesResponse, StandingsResponse } from './types/api.ts';

export { RETRY_AFTER_MS } from './read-through.ts';

const COMPETITION_IDS = {
  PL: 2021,
  BL1: 2002,
  SA: 2019,
  PD: 2014,
  FL1: 2015,
  CL: 2001,
};

export type FootballDataFetcher = Fetcher;

/**
 * A second source that fills in what football-data's plan leaves out of a finished match
 * (events, stats, lineups, momentum). It returns the report unchanged when it can't help.
 */
export type MatchDetails = {
  enrich(match: MatchDetailResponse, report: MatchReport): Promise<MatchReport>;
};
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
  details,
}: {
  fetcher: FootballDataFetcher;
  cache: FootballDataCache;
  now: () => number;
  details?: MatchDetails;
}): FootballData {
  const readThrough = createReadThrough({ name: 'football-data', fetcher, cache, now });

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
      if (!report) return { status: 'not-found' };
      if (!details) return { status: 'ok', report };
      const [enriched, err] = await tryCatch(details.enrich(result.data, report));
      if (err) console.error(`[football-data] enriching match ${matchId} failed`, err);
      return { status: 'ok', report: enriched ?? report };
    },
  };
}
