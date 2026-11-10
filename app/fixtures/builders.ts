// Test and dev-scenario data in real football-data shapes, relative to fixed NOW.
// Builders never read the real clock.
// "Arsenal lost their last two, next match in 2 days":
// const club = buildTeam({ id: 57, shortName: 'Arsenal' });
// const card = buildClubMatches({ club, form: 'LL', fixtures: [2] });
import type { Club } from '../lib/clubs.ts';
import { toClubMatches } from '../lib/club-matches.ts';
import type { Outcome, ClubMatches, Venue } from '../lib/club-matches.ts';
import type {
  Match,
  MatchesResponse,
  StandingsResponse,
  StandingTableRow,
} from '../lib/types/api.ts';

export const NOW = Date.parse('2026-11-08T12:00:00Z');
const DAY = 86_400_000;
type ApiTeam = Match['homeTeam'];
type Competition = Match['competition'];
type Group = StandingsResponse['standings'][number];

const competitions: Record<string, [number, string, string]> = {
  PL: [2021, 'Premier League', 'LEAGUE'],
  BL1: [2002, 'Bundesliga', 'LEAGUE'],
  SA: [2019, 'Serie A', 'LEAGUE'],
  PD: [2014, 'La Liga', 'LEAGUE'],
  FL1: [2015, 'Ligue 1', 'LEAGUE'],
  CL: [2001, 'UEFA Champions League', 'CUP'],
};

function competition(code = 'PL', overrides: Partial<Competition> = {}): Competition {
  const [id, name, type] = competitions[code] ?? [1, code, 'LEAGUE'];
  return {
    id,
    name,
    code,
    type,
    emblem: '',
    ...overrides,
  };
}

const area: Match['area'] = {
  id: 2072,
  name: 'England',
  code: 'ENG',
  flag: '',
};
const season: Match['season'] = {
  id: 2502,
  startDate: '2026-08-21',
  endDate: '2027-05-30',
  currentMatchday: 7,
  winner: null,
};

export function buildTeam(overrides: Partial<ApiTeam> = {}): ApiTeam {
  const id = overrides.id ?? 57;
  const shortName = overrides.shortName ?? `T${id}`;
  return {
    id,
    name: `${shortName} FC`,
    shortName,
    tla: shortName.slice(0, 3).toUpperCase(),
    crest: '',
    ...overrides,
  };
}

export function buildStandingRow(overrides: Partial<StandingTableRow> = {}): StandingTableRow {
  return {
    position: 1,
    team: buildTeam(),
    playedGames: 0,
    form: null,
    won: 0,
    draw: 0,
    lost: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    ...overrides,
  };
}

export type StandingsGroupOptions = Partial<Omit<Group, 'table'>> & {
  clubs?: ApiTeam[];
  rows?: Partial<StandingTableRow>[];
};
export type StandingsOptions = StandingsGroupOptions & {
  competition?: Partial<Competition>;
  groups?: StandingsGroupOptions[];
};

export function buildStandings(code = 'PL', options: StandingsOptions = {}): StandingsResponse {
  const groups = options.groups ?? [options];
  return {
    filters: { season: '2026' },
    area: { ...area },
    season: { ...season },
    competition: competition(code, options.competition),
    standings: groups.map(
      ({ clubs = [], rows = [], stage = 'REGULAR_SEASON', type = 'TOTAL', group = null }) => ({
        stage,
        type,
        group,
        table: (clubs.length ? clubs.map((club, i) => ({ ...rows[i], team: club })) : rows).map(
          (row, i) => buildStandingRow({ ...row, position: i + 1 }),
        ),
      }),
    ),
  };
}

export type MatchOptions = {
  days?: number;
  utcDate?: string;
  opponent?: ApiTeam;
  venue?: Venue;
  competition?: string | Partial<Competition>;
  result?: Outcome;
  score?: [number | null, number | null]; // Goals for and against the club.
  overrides?: Partial<Match>;
};
export type MatchesOptions = {
  club?: ApiTeam;
  now?: number;
  form?: string;
  results?: MatchOptions[];
  fixtures?: (number | MatchOptions)[];
  matches?: Match[]; // Raw API order, for projection tests.
};

export function buildMatch(options: MatchOptions = {}, club = buildTeam(), now = NOW): Match {
  const { result, venue = 'H', opponent = buildTeam({ id: 99, shortName: 'Chelsea' }) } = options;
  const defaultScores: Record<Outcome, [number, number]> = {
    W: [2, 0],
    L: [0, 2],
    D: [2, 2],
  };
  const defaultScore = result ? defaultScores[result] : [null, null];
  const [gf, ga] = options.score ?? defaultScore;
  const home = venue === 'H' ? gf : ga;
  const away = venue === 'H' ? ga : gf;
  const defaultDays = result ? -7 : 2;
  const utcDate =
    options.utcDate ?? new Date(now + (options.days ?? defaultDays) * DAY).toISOString();
  let winner: Match['score']['winner'] = null;
  if (home != null && away != null) {
    if (home > away) winner = 'HOME_TEAM';
    else if (home < away) winner = 'AWAY_TEAM';
    else winner = 'DRAW';
  }
  return {
    id: 1,
    area: { ...area },
    season: { ...season },
    competition:
      typeof options.competition === 'string'
        ? competition(options.competition)
        : competition(options.competition?.code, options.competition),
    utcDate,
    status: result ? 'FINISHED' : 'TIMED',
    venue: null,
    matchday: 7,
    stage: 'REGULAR_SEASON',
    group: null,
    lastUpdated: utcDate,
    homeTeam: venue === 'H' ? club : opponent,
    awayTeam: venue === 'H' ? opponent : club,
    score: {
      winner,
      duration: 'REGULAR',
      fullTime: { home, away },
      halfTime: { home: null, away: null },
    },
    odds: { msg: '' },
    referees: [],
    ...options.overrides,
  };
}

export function buildMatches(options: MatchesOptions = {}): MatchesResponse {
  const { club = buildTeam(), now = NOW, form = '', fixtures = [] } = options;
  const results: MatchOptions[] =
    options.results ??
    [...form].map((result, i) => {
      if (result !== 'W' && result !== 'D' && result !== 'L')
        throw new Error(`Invalid form outcome: ${result}`);
      return { result, days: -(form.length - i) * 7 };
    });
  const fixtureDescriptions = fixtures.map((fixture) =>
    typeof fixture === 'number' ? { days: fixture } : fixture,
  );
  const matches =
    options.matches ??
    [...results, ...fixtureDescriptions]
      .map((description, i) =>
        buildMatch(
          { ...description, overrides: { id: i + 1, ...description.overrides } },
          club,
          now,
        ),
      )
      .sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
  const finished = matches.filter((match) => match.status === 'FINISHED');
  const outcomes = finished.map((match) => {
    const { home, away } = match.score.fullTime;
    if (home == null || away == null) return null;
    const difference = match.homeTeam.id === club.id ? home - away : away - home;
    if (difference > 0) return 'W';
    if (difference < 0) return 'L';
    return 'D';
  });
  const codes = [...new Set(matches.map((match) => match.competition.code))].join(',');
  return {
    filters: { competitions: codes, permission: 'TIER_ONE', limit: matches.length },
    resultSet: {
      count: matches.length,
      competitions: codes,
      first: matches[0]?.utcDate ?? '',
      last: matches.at(-1)?.utcDate ?? '',
      played: finished.length,
      wins: outcomes.filter((result) => result === 'W').length,
      draws: outcomes.filter((result) => result === 'D').length,
      losses: outcomes.filter((result) => result === 'L').length,
    },
    matches,
  };
}

export function buildClubMatches(options: MatchesOptions = {}): ClubMatches {
  return toClubMatches(buildMatches(options), options.club?.id ?? 57, options.now ?? NOW);
}

export function buildClub(overrides: Partial<Club> = {}): Club {
  const club = buildTeam({ id: overrides.id ?? 57, shortName: overrides.name ?? 'T57' });
  return {
    id: club.id,
    name: club.shortName,
    fullName: club.name,
    crest: club.crest,
    competitionCode: 'PL',
    position: 1,
    ...overrides,
  };
}
