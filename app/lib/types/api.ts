type StandingsFilters = {
  season: string;
};

type Area = {
  id: number;
  name: string;
  code: string;
  flag: string;
};

type Competition = {
  id: number;
  name: string;
  code: string;
  type: string;
  emblem: string;
};

type Season = {
  id: number;
  startDate: string;
  endDate: string;
  currentMatchday: number;
  winner: string | null;
};

type StandingGroup = {
  stage:
    | 'REGULAR_SEASON'
    | 'GROUP_STAGE'
    | 'LAST_16'
    | 'QUARTER_FINALS'
    | 'SEMI_FINALS'
    | 'FINAL';
  type: 'TOTAL' | 'HOME' | 'AWAY';
  group: string | null;
  table: StandingTableRow[];
};

export type StandingTableRow = {
  position: number;
  team: Team;
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type Team = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
};

export type StandingsResponse = {
  filters: StandingsFilters;
  area: Area;
  competition: Competition;
  season: Season;
  standings: StandingGroup[];
};

type Filters = {
  competitions: string;
  permission: string;
  limit: number;
};

type ResultSet = {
  count: number;
  competitions: string;
  first: string;
  last: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
};

type MatchStatus =
  | 'FINISHED'
  | 'TIMED'
  | 'SCHEDULED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'POSTPONED'
  | 'SUSPENDED'
  | 'CANCELLED';

type ScoreDetail = {
  home: number | null;
  away: number | null;
};

type Score = {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  fullTime: ScoreDetail;
  halfTime: ScoreDetail;
};

type Odds = {
  msg: string;
};

type Referee = {
  id: number;
  name: string;
  type: 'REFEREE';
  nationality: string;
};

export type Match = {
  area: Area;
  competition: Competition;
  season: Season;
  id: number;
  utcDate: string;
  status: MatchStatus;
  venue: string | null;
  matchday: number;
  stage:
    | 'REGULAR_SEASON'
    | 'GROUP_STAGE'
    | 'LAST_16'
    | 'QUARTER_FINALS'
    | 'SEMI_FINALS'
    | 'FINAL';
  group: string | null;
  lastUpdated: string;
  homeTeam: Team;
  awayTeam: Team;
  score: Score;
  odds: Odds;
  referees: Referee[];
};

export type MatchesResponse = {
  filters: Filters;
  resultSet: ResultSet;
  matches: Match[];
};

// ── /v4/matches/{id}

type Person = {
  id: number;
  name: string;
};

type TeamRef = {
  id: number;
  name: string;
};

export type MatchGoal = {
  minute: number;
  injuryTime: number | null;
  type: 'REGULAR' | 'OWN' | 'PENALTY';
  team: TeamRef;
  scorer: Person;
  assist: Person | null;
  score: { home: number; away: number };
};

export type MatchBooking = {
  minute: number;
  injuryTime?: number | null;
  team: TeamRef;
  player: Person;
  card: 'YELLOW' | 'YELLOW_RED' | 'RED';
};

export type MatchSubstitution = {
  minute: number;
  injuryTime?: number | null;
  team: TeamRef;
  playerOut: Person;
  playerIn: Person;
};

// Full-time totals. Only plans with the statistics add-on return them.
export type TeamStatistics = {
  corner_kicks?: number;
  free_kicks?: number;
  goal_kicks?: number;
  offsides?: number;
  fouls?: number;
  ball_possession?: number;
  saves?: number;
  throw_ins?: number;
  shots?: number;
  shots_on_goal?: number;
  shots_off_goal?: number;
  yellow_cards?: number;
  yellow_red_cards?: number;
  red_cards?: number;
};

type DetailTeam = Team & { statistics?: TeamStatistics | null };

// One match in full. Which fields arrive depends on the plan: the base tiers send the same match
// as /teams/{id}/matches does; Deep Data adds the minute-stamped goals, bookings and
// substitutions; the statistics and odds add-ons add the totals and the prices.
export type MatchDetailResponse = Omit<Match, 'homeTeam' | 'awayTeam' | 'odds' | 'referees'> & {
  minute?: number | null;
  injuryTime?: number | null;
  attendance?: number | null;
  homeTeam: DetailTeam;
  awayTeam: DetailTeam;
  goals?: MatchGoal[];
  penalties?: unknown[];
  bookings?: MatchBooking[];
  substitutions?: MatchSubstitution[];
  odds?: { homeWin: number | null; draw: number | null; awayWin: number | null } | { msg: string };
  referees: Array<{ id: number; name: string; type: string; nationality: string | null }>;
};
