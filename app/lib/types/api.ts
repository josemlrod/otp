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
