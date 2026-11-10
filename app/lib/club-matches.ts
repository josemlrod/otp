import type { Match, MatchesResponse } from './types/api.ts';

// What a club card draws, cut down from the full season of matches the API returns.

export const FORM_LENGTH = 5;
export const FIXTURES_SHOWN = 4;

export type Outcome = 'W' | 'D' | 'L';
export type Venue = 'H' | 'A';

export type Opponent = {
  id: number;
  name: string;
  tla: string;
  crest: string;
};

export type PlayedMatch = {
  utcDate: string;
  result: Outcome;
  gf: number;
  ga: number;
  venue: Venue;
  opponent: Opponent;
  competition: string;
};

export type Fixture = {
  utcDate: string;
  venue: Venue;
  opponent: Opponent;
  competition: string;
};

export type ClubMatches = {
  clubId: number;
  fetchedAt: number;
  form: PlayedMatch[]; // oldest → newest, so the newest result sits on the right
  fixtures: Fixture[]; // soonest first
};

const UPCOMING = new Set(['TIMED', 'SCHEDULED']);

function byDate(a: Match, b: Match) {
  return Date.parse(a.utcDate) - Date.parse(b.utcDate);
}

function sideOf(match: Match, clubId: number) {
  const venue: Venue = match.homeTeam.id === clubId ? 'H' : 'A';
  const club = venue === 'H' ? match.awayTeam : match.homeTeam;
  const opponent: Opponent = {
    id: club.id,
    name: club.shortName || club.name,
    tla: club.tla,
    crest: club.crest,
  };
  return { venue, opponent, competition: match.competition.code };
}

export function toClubMatches(
  response: MatchesResponse,
  clubId: number,
  fetchedAt: number,
): ClubMatches {
  const matches = [...response.matches].sort(byDate);

  const form = matches
    .filter((match) => match.status === 'FINISHED')
    .slice(-FORM_LENGTH)
    .flatMap((match): PlayedMatch[] => {
      const side = sideOf(match, clubId);
      const { home, away } = match.score.fullTime;
      if (home == null || away == null) return [];
      const gf = side.venue === 'H' ? home : away;
      const ga = side.venue === 'H' ? away : home;
      const result: Outcome = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      return [{ utcDate: match.utcDate, result, gf, ga, ...side }];
    });

  const fixtures = matches
    .filter((match) => UPCOMING.has(match.status))
    .slice(0, FIXTURES_SHOWN)
    .map((match): Fixture => ({ utcDate: match.utcDate, ...sideOf(match, clubId) }));

  return { clubId, fetchedAt, form, fixtures };
}
