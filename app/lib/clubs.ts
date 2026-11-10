import type { StandingsResponse } from './types/api.ts';

export type Club = {
  id: number;
  name: string;
  fullName: string;
  crest: string;
  competitionCode: string;
  position: number;
};

export type ClubSection = {
  code: string;
  name: string;
  clubs: Club[];
};

const REST_OF_EUROPE = 'Rest of Europe';

function clubsOf(standing: StandingsResponse): Club[] {
  return standing.standings
    .filter((group) => group.type === 'TOTAL')
    .flatMap((group) => group.table)
    .map(({ team: club, position }) => ({
      id: club.id,
      name: club.shortName || club.name,
      fullName: club.name,
      crest: club.crest,
      competitionCode: standing.competition.code,
      position,
    }));
}

function isLeague(standing: StandingsResponse) {
  return standing.competition.type === 'LEAGUE';
}

export function clubSections(standings: StandingsResponse[]): ClubSection[] {
  const seen = new Set<number>();
  const ordered = [...standings.filter(isLeague), ...standings.filter((s) => !isLeague(s))];

  return ordered
    .map((standing) => {
      const clubs = clubsOf(standing)
        .filter((club) => !seen.has(club.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const club of clubs) seen.add(club.id);
      return {
        code: standing.competition.code,
        name: isLeague(standing) ? standing.competition.name : REST_OF_EUROPE,
        clubs,
      };
    })
    .filter((section) => section.clubs.length > 0);
}

export function leagueLeaders(standings: StandingsResponse[], count: number): Club[] {
  return standings
    .filter(isLeague)
    .flatMap((standing) => clubsOf(standing).slice(0, 1))
    .slice(0, count);
}
