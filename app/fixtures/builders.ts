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
  MatchBooking,
  MatchDetailResponse,
  MatchGoal,
  MatchSubstitution,
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

// ── /v4/matches/{id}

export type MatchDetailOptions = {
  /** Deep Data: goals, bookings and substitutions with minutes. */
  events?: boolean;
  /** The statistics add-on. */
  stats?: boolean;
  /** The odds add-on. */
  odds?: boolean;
};

const FIRST = ['Marco', 'Jonas', 'Luca', 'Theo', 'Rúben', 'Kai', 'Noah', 'Mateo', 'Leon', 'Ilias', 'Sami'];
const LAST = ['Silva', 'Keller', 'Okafor', 'Laurent', 'Novak', 'Romero', 'Fischer', 'Costa', 'Hughes', 'van Dijk', 'Moreno'];
const player = (team: ApiTeam, n: number) => ({
  id: team.id * 100 + n,
  name: `${FIRST[(team.id + n) % FIRST.length]} ${LAST[(team.id * 3 + n) % LAST.length]}`,
});

// A finished match from /teams/{id}/matches, filled out the way /matches/{id} returns it. Goals
// are spread through the match to agree with the full-time score; the rest is plausible filler.
export function buildMatchDetail(match: Match, options: MatchDetailOptions = {}): MatchDetailResponse {
  const { events = true, stats = true, odds = true } = options;
  const home = match.score.fullTime.home ?? 0;
  const away = match.score.fullTime.away ?? 0;
  const total = home + away;
  const ref = (team: ApiTeam) => ({ id: team.id, name: team.name });

  // Interleave the sides so a 2–1 reads 1–0, 1–1, 2–1 rather than 2–0 then 2–1.
  const order: ('home' | 'away')[] = [];
  for (let h = home, a = away; h + a > 0; ) {
    const homeNext = h > 0 && (a === 0 || (order.length + match.id) % 2 === 0);
    order.push(homeNext ? 'home' : 'away');
    if (homeNext) h--;
    else a--;
  }
  let score = { home: 0, away: 0 };
  const goals: MatchGoal[] = order.map((side, i) => {
    const minute = Math.round(10 + ((i + 0.6) / total) * 76);
    score = { ...score, [side]: score[side] + 1 };
    const team = side === 'home' ? match.homeTeam : match.awayTeam;
    return {
      minute,
      injuryTime: null,
      type: 'REGULAR',
      team: ref(team),
      scorer: player(team, 9 + (i % 2)),
      assist: i % 3 === 2 ? null : player(team, 7 + (i % 2)),
      score: { ...score },
    };
  });
  const halfTime = goals.filter((g) => g.minute <= 45).at(-1)?.score ?? { home: 0, away: 0 };
  const bookings: MatchBooking[] = [
    { minute: 34, team: ref(match.awayTeam), player: player(match.awayTeam, 6), card: 'YELLOW' },
    { minute: 45, injuryTime: 2, team: ref(match.homeTeam), player: player(match.homeTeam, 4), card: 'YELLOW' },
    { minute: 71, team: ref(match.homeTeam), player: player(match.homeTeam, 6), card: 'YELLOW' },
  ];
  const substitutions: MatchSubstitution[] = [62, 66, 75, 84].map((minute, i) => {
    const team = i % 2 === 0 ? match.homeTeam : match.awayTeam;
    return { minute, team: ref(team), playerOut: player(team, 11 - i), playerIn: player(team, 12 + i) };
  });
  const statistics = (shots: number, onGoal: number, corners: number, possession: number) => ({
    corner_kicks: corners,
    fouls: 11,
    ball_possession: possession,
    saves: 2,
    shots,
    shots_on_goal: onGoal,
    shots_off_goal: shots - onGoal,
    yellow_cards: 1,
    red_cards: 0,
  });
  const lean = Math.sign(home - away);

  return {
    ...match,
    status: 'FINISHED',
    venue: match.venue ?? 'Home Ground',
    score: { ...match.score, halfTime: events ? halfTime : match.score.halfTime },
    homeTeam: { ...match.homeTeam, ...(stats ? { statistics: statistics(13 + lean * 3, 5 + home, 6, 52 + lean * 4) } : {}) },
    awayTeam: { ...match.awayTeam, ...(stats ? { statistics: statistics(10 - lean * 2, 3 + away, 4, 48 - lean * 4) } : {}) },
    ...(events ? { minute: 90, injuryTime: 4, attendance: 41_200, goals, penalties: [], bookings, substitutions } : {}),
    odds: odds ? { homeWin: 2.1, draw: 3.6, awayWin: 3.3 } : { msg: 'Activate Odds-Package in User-Panel to retrieve odds.' },
    referees: [{ id: 11605, name: 'Anthony Taylor', type: 'REFEREE', nationality: 'England' }],
  };
}
