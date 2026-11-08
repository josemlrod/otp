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
