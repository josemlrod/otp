import type { MatchDetailResponse, TeamStatistics } from './types/api.ts';

// What the match sheet draws. The base comes from football-data's /v4/matches/{id}; every part
// past the score is optional because that API only sends it on some plans (`events` needs Deep
// Data, `stats` the statistics add-on, `odds` the odds add-on). FotMob, when it has the match,
// fills in events, stats, lineups and momentum (see fotmob.ts).

export type Side = 'home' | 'away';
export type Pair = [home: number, away: number];

export type ReportClub = {
  id: number;
  name: string;
  tla: string;
  crest: string;
};

type Stamp = { side: Side; minute: number; injuryTime: number | null };

export type ReportEvent =
  | (Stamp & {
      kind: 'goal';
      goal: 'regular' | 'own' | 'penalty';
      player: string;
      assist: string | null;
      score: Pair;
    })
  | (Stamp & { kind: 'card'; card: 'yellow' | 'second-yellow' | 'red'; player: string })
  | (Stamp & { kind: 'sub'; playerIn: string; playerOut: string });

export const STAT_KEYS = ['possession', 'xg', 'shots', 'onTarget', 'corners', 'fouls', 'saves'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type ReportStats = Partial<Record<StatKey, Pair>>;

/** One minute of attacking pressure: above 0 the home side was on top, below 0 the away side. */
export type MomentumPoint = { minute: number; value: number };

export type ReportPlayer = {
  id: number;
  name: string;
  shirt: string | null;
  /** The match rating out of 10, when one was given. */
  rating: number | null;
  captain: boolean;
  /** A starter's spot on a vertical pitch, 0–1: x across from the left, y up from their own goal. */
  spot: { x: number; y: number } | null;
  /** Minutes they came on or went off, or null. */
  on: number | null;
  off: number | null;
  goals: number;
  assists: number;
  card: 'yellow' | 'second-yellow' | 'red' | null;
};

export type ReportLineup = {
  formation: string | null;
  coach: string | null;
  starters: ReportPlayer[];
  subs: ReportPlayer[];
};

export type MatchReport = {
  id: number;
  fetchedAt: number;
  utcDate: string;
  competition: string;
  competitionName: string;
  matchday: number | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
  home: ReportClub;
  away: ReportClub;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  fullTime: Pair;
  halfTime: Pair | null;
  /** Second-half added time, when the API sends it. */
  injuryTime: number | null;
  /** First-half added time as announced, when the source sends it. */
  firstHalfInjuryTime: number | null;
  /** Goals, cards and substitutions in match order, or null when the plan doesn't include them. */
  events: ReportEvent[] | null;
  stats: ReportStats | null;
  /** Pre-match chances as whole percentages (home, draw, away), the bookmaker's margin removed. */
  odds: [number, number, number] | null;
  /** Pressure minute by minute. Added time is squeezed in as fractions: 45.5 is first-half stoppage. */
  momentum: MomentumPoint[] | null;
  lineups: { home: ReportLineup; away: ReportLineup } | null;
  /** The player of the match, by player id. */
  bestPlayer: number | null;
};

const STAT_FIELDS: Partial<Record<StatKey, keyof TeamStatistics>> = {
  possession: 'ball_possession',
  shots: 'shots',
  onTarget: 'shots_on_goal',
  corners: 'corner_kicks',
  fouls: 'fouls',
  saves: 'saves',
};

function club(team: MatchDetailResponse['homeTeam']): ReportClub {
  return { id: team.id, name: team.shortName || team.name, tla: team.tla, crest: team.crest };
}

function pair(detail: { home: number | null; away: number | null }): Pair | null {
  return detail.home == null || detail.away == null ? null : [detail.home, detail.away];
}

function stats(match: MatchDetailResponse): ReportStats | null {
  const home = match.homeTeam.statistics;
  const away = match.awayTeam.statistics;
  if (!home || !away) return null;
  const out: ReportStats = {};
  for (const key of STAT_KEYS) {
    const field = STAT_FIELDS[key];
    if (!field) continue;
    const h = home[field];
    const a = away[field];
    if (typeof h === 'number' && typeof a === 'number') out[key] = [h, a];
  }
  return Object.keys(out).length ? out : null;
}

function odds(match: MatchDetailResponse): MatchReport['odds'] {
  const prices = match.odds;
  if (!prices || !('homeWin' in prices)) return null;
  const { homeWin, draw, awayWin } = prices;
  if (!homeWin || !draw || !awayWin) return null;
  const inverse = [1 / homeWin, 1 / draw, 1 / awayWin];
  const total = inverse[0] + inverse[1] + inverse[2];
  const [h, d, a] = inverse.map((x) => Math.round((x / total) * 100));
  return [h, d, a];
}

const CARD = { YELLOW: 'yellow', YELLOW_RED: 'second-yellow', RED: 'red' } as const;
const GOAL = { REGULAR: 'regular', OWN: 'own', PENALTY: 'penalty' } as const;

function events(match: MatchDetailResponse): ReportEvent[] | null {
  // Deep Data sends `goals` even when there were none; its absence means the plan lacks events.
  if (!Array.isArray(match.goals)) return null;
  const side = (teamId: number): Side => (teamId === match.homeTeam.id ? 'home' : 'away');
  const list: ReportEvent[] = [
    ...match.goals.map((g): ReportEvent => ({
      kind: 'goal',
      side: side(g.team.id),
      minute: g.minute,
      injuryTime: g.injuryTime ?? null,
      goal: GOAL[g.type] ?? 'regular',
      player: g.scorer.name,
      assist: g.assist?.name ?? null,
      score: [g.score.home, g.score.away],
    })),
    ...(match.bookings ?? []).map((b): ReportEvent => ({
      kind: 'card',
      side: side(b.team.id),
      minute: b.minute,
      injuryTime: b.injuryTime ?? null,
      card: CARD[b.card] ?? 'yellow',
      player: b.player.name,
    })),
    ...(match.substitutions ?? []).map((s): ReportEvent => ({
      kind: 'sub',
      side: side(s.team.id),
      minute: s.minute,
      injuryTime: s.injuryTime ?? null,
      playerIn: s.playerIn.name,
      playerOut: s.playerOut.name,
    })),
  ];
  return inMatchOrder(list);
}

const RANK = { goal: 0, card: 1, sub: 2 };

/** Match order; at the same minute a goal comes first, so the score reads right after it. */
export function inMatchOrder(events: ReportEvent[]): ReportEvent[] {
  return events.sort(
    (a, b) =>
      a.minute - b.minute ||
      (a.injuryTime ?? 0) - (b.injuryTime ?? 0) ||
      RANK[a.kind] - RANK[b.kind],
  );
}

export function toMatchReport(match: MatchDetailResponse, fetchedAt: number): MatchReport | null {
  const fullTime = pair(match.score.fullTime);
  if (match.status !== 'FINISHED' || !fullTime) return null;
  return {
    id: match.id,
    fetchedAt,
    utcDate: match.utcDate,
    competition: match.competition.code,
    competitionName: match.competition.name,
    matchday: match.matchday ?? null,
    venue: match.venue || null,
    attendance: match.attendance ?? null,
    referee: match.referees.find((r) => r.type === 'REFEREE')?.name ?? null,
    home: club(match.homeTeam),
    away: club(match.awayTeam),
    duration: match.score.duration,
    fullTime,
    halfTime: pair(match.score.halfTime),
    injuryTime: match.injuryTime ?? null,
    firstHalfInjuryTime: null,
    events: events(match),
    stats: stats(match),
    odds: odds(match),
    momentum: null,
    lineups: null,
    bestPlayer: null,
  };
}
