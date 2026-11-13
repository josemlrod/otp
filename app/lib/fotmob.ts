import type { FootballDataCache } from './api-cache.ts';
import type { MatchDetails } from './football-data.ts';
import {
  inMatchOrder,
  type MatchReport,
  type MomentumPoint,
  type Pair,
  type ReportEvent,
  type ReportLineup,
  type ReportPlayer,
  type ReportStats,
  type Side,
  type StatKey,
} from './match-report.ts';
import { createReadThrough, type Fetcher } from './read-through.ts';
import type { MatchDetailResponse } from './types/api.ts';

// FotMob fills in a finished match where football-data's plan stops at the score: goals with
// assists, cards and substitutions, full-time stats with xG, lineups with ratings, and minute-by-
// minute momentum. Its API is undocumented, so every field is read defensively and anything
// missing just leaves the football-data report as it was.
//
// FotMob has its own match ids. The match is found in FotMob's list for its kickoff day: same
// competition, same kickoff, and the closest club names on both sides.

export const FOTMOB_BASE_URL = 'https://www.fotmob.com';

/** football-data competition code → FotMob league id. */
const LEAGUES: Record<string, number> = {
  PL: 47,
  BL1: 54,
  SA: 55,
  PD: 87,
  FL1: 53,
  CL: 42,
  ELC: 48,
  PPL: 61,
  DED: 57,
  BSA: 268,
  EC: 50,
  WC: 77,
};

// The subset of FotMob's responses OTP reads. Everything is optional because nothing is promised.

type FmListedTeam = { id: number; name?: string; shortName?: string; score?: number };
export type FmListedMatch = {
  id: number;
  home: FmListedTeam;
  away: FmListedTeam;
  status?: { utcTime?: string; finished?: boolean };
};
export type FmDay = { leagues?: Array<{ id: number; primaryId?: number; matches?: FmListedMatch[] }> };

type FmPlayerRef = { id?: number | string | null; name?: string };
export type FmEvent = {
  type: string;
  time: number;
  overloadTime?: number | null;
  isHome?: boolean;
  isPenaltyShootoutEvent?: boolean;
  player?: FmPlayerRef;
  nameStr?: string;
  // Goal
  ownGoal?: boolean | null;
  goalDescriptionKey?: string | null;
  newScore?: [number, number];
  assistStr?: string | null;
  assistPlayerId?: number | null;
  // Card
  card?: string | null;
  // Substitution: [player on, player off]
  swap?: FmPlayerRef[];
  // AddedTime
  minutesAddedInput?: number;
};

export type FmPlayer = {
  id: number;
  name: string;
  shirtNumber?: string | null;
  isCaptain?: boolean;
  verticalLayout?: { x: number; y: number };
  performance?: {
    rating?: number | null;
    events?: Array<{ type: string }>;
    substitutionEvents?: Array<{ time: number; type: string }>;
  };
};

type FmTeamLineup = {
  formation?: string | null;
  coach?: { name?: string } | null;
  starters?: FmPlayer[];
  subs?: FmPlayer[];
};

type FmStat = { key?: string; stats?: Array<number | string | null> };

export type FmMatch = {
  general?: { finished?: boolean };
  header?: { status?: { finished?: boolean } };
  content?: {
    matchFacts?: {
      events?: { events?: FmEvent[] };
      infoBox?: {
        Stadium?: { name?: string };
        Referee?: { text?: string };
        Attendance?: number;
      };
      playerOfTheMatch?: { id?: number } | null;
    };
    stats?: { Periods?: { All?: { stats?: Array<{ stats?: FmStat[] }> } } } | null;
    lineup?: { lineupType?: string; homeTeam?: FmTeamLineup; awayTeam?: FmTeamLineup } | null;
    momentum?: { main?: { data?: Array<{ minute: number; value: number }> } } | null;
  };
};

// Finding the match --------------------------------------------------------------------------

const DROP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ssc', 'club', 'de', 'del', 'la', 'e', 'cp']);

/** "Club Atlético de Madrid" → ["atletico", "madrid"]. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !DROP.has(t));
}

/** How much two club names agree, 0–1: the share of the shorter name found in the longer. */
function nameSimilarity(a: string[], b: string[]) {
  const ta = a.map(nameTokens);
  const tb = b.map(nameTokens);
  let best = 0;
  for (const x of ta) {
    for (const y of tb) {
      if (!x.length || !y.length) continue;
      const shared = x.filter((t) => y.includes(t)).length;
      best = Math.max(best, shared / Math.min(x.length, y.length));
    }
  }
  return best;
}

type MatchKey = {
  utcDate: string;
  competition: string;
  home: string[];
  away: string[];
};

function keyOf(match: MatchDetailResponse): MatchKey {
  const names = (t: MatchDetailResponse['homeTeam']) => [t.name, t.shortName].filter(Boolean);
  return {
    utcDate: match.utcDate,
    competition: match.competition.code,
    home: names(match.homeTeam),
    away: names(match.awayTeam),
  };
}

/** The FotMob match in a day's list that is this football-data match, or null. */
export function findMatch(day: FmDay, key: MatchKey): FmListedMatch | null {
  const league = LEAGUES[key.competition];
  const kickoff = Date.parse(key.utcDate);
  let best: { match: FmListedMatch; score: number } | null = null;
  for (const l of day.leagues ?? []) {
    if (league !== undefined && (l.primaryId ?? l.id) !== league) continue;
    for (const m of l.matches ?? []) {
      const at = Date.parse(m.status?.utcTime ?? '');
      // A kickoff moved by a few hours is still the same match; a different day isn't.
      if (!(Math.abs(at - kickoff) < 12 * 3_600_000)) continue;
      const home = nameSimilarity(key.home, [m.home.name ?? '', m.home.shortName ?? '']);
      const away = nameSimilarity(key.away, [m.away.name ?? '', m.away.shortName ?? '']);
      if (!(home > 0 && away > 0) && !(at === kickoff && home + away > 0)) continue;
      const score = home + away + (at === kickoff ? 1 : 0);
      if (!best || score > best.score) best = { match: m, score };
    }
  }
  return best?.match ?? null;
}

/** FotMob's list days to look in: the kickoff's UTC date, then either side of it. */
function daysAround(utcDate: string) {
  const day = (offset: number) =>
    new Date(Date.parse(utcDate) + offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  return [day(0), day(1), day(-1)];
}

// Projecting the match ------------------------------------------------------------------------

const STAT_KEYS: Record<string, StatKey> = {
  BallPossesion: 'possession',
  expected_goals: 'xg',
  total_shots: 'shots',
  ShotsOnTarget: 'onTarget',
  corners: 'corners',
  fouls: 'fouls',
  keeper_saves: 'saves',
};

/** 593, "2.11" or "593 (90%)" → the leading number. */
function num(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function stats(match: FmMatch): ReportStats | null {
  const out: ReportStats = {};
  for (const group of match.content?.stats?.Periods?.All?.stats ?? []) {
    for (const stat of group.stats ?? []) {
      const key = stat.key && STAT_KEYS[stat.key];
      if (!key || out[key]) continue;
      const h = num(stat.stats?.[0]);
      const a = num(stat.stats?.[1]);
      if (h !== null && a !== null) out[key] = [h, a];
    }
  }
  return Object.keys(out).length ? out : null;
}

function cardOf(card: string | null | undefined): 'yellow' | 'second-yellow' | 'red' {
  const c = (card ?? '').toLowerCase();
  if (c.includes('red') && c.includes('yellow')) return 'second-yellow';
  return c.includes('red') ? 'red' : 'yellow';
}

function events(match: FmMatch, names: Map<number, string>): ReportEvent[] | null {
  const list = match.content?.matchFacts?.events?.events;
  if (!Array.isArray(list)) return null;
  const out: ReportEvent[] = [];
  let score: Pair = [0, 0];
  for (const e of list) {
    if (e.isPenaltyShootoutEvent || typeof e.time !== 'number') continue;
    const side: Side = e.isHome ? 'home' : 'away';
    const stamp = { side, minute: e.time, injuryTime: e.overloadTime || null };
    const player = e.player?.name?.trim() || e.nameStr || '';
    if (e.type === 'Goal' && e.newScore) {
      const next: Pair = [e.newScore[0], e.newScore[1]];
      // The side the goal counts for, own goals included, is the one whose score went up.
      const scored: Side = next[0] > score[0] ? 'home' : next[1] > score[1] ? 'away' : side;
      score = next;
      const assist =
        (e.assistPlayerId != null && names.get(e.assistPlayerId)) ||
        e.assistStr?.replace(/^assist by\s+/i, '').trim() ||
        null;
      out.push({
        ...stamp,
        side: scored,
        kind: 'goal',
        goal: e.ownGoal ? 'own' : e.goalDescriptionKey === 'penalty' ? 'penalty' : 'regular',
        player,
        assist,
        score: next,
      });
    } else if (e.type === 'Card') {
      out.push({ ...stamp, kind: 'card', card: cardOf(e.card), player });
    } else if (e.type === 'Substitution' && e.swap?.length === 2) {
      out.push({
        ...stamp,
        kind: 'sub',
        playerIn: e.swap[0].name ?? '',
        playerOut: e.swap[1].name ?? '',
      });
    }
  }
  return inMatchOrder(out);
}

function addedTime(match: FmMatch, minute: 45 | 90): number | null {
  const e = match.content?.matchFacts?.events?.events?.find(
    (x) => x.type === 'AddedTime' && x.time === minute,
  );
  return typeof e?.minutesAddedInput === 'number' ? e.minutesAddedInput : null;
}

function player(p: FmPlayer, starter: boolean): ReportPlayer {
  const perf = p.performance ?? {};
  const happened = (type: string) => (perf.events ?? []).filter((e) => e.type === type).length;
  const subbed = (type: string) => perf.substitutionEvents?.find((s) => s.type === type)?.time ?? null;
  const red = happened('redCard') > 0;
  const yellow = happened('yellowCard') > 0;
  return {
    id: p.id,
    name: p.name,
    shirt: p.shirtNumber ?? null,
    rating: typeof perf.rating === 'number' ? perf.rating : null,
    captain: !!p.isCaptain,
    spot: starter && p.verticalLayout ? { x: p.verticalLayout.x, y: p.verticalLayout.y } : null,
    on: subbed('subIn'),
    off: subbed('subOut'),
    goals: happened('goal'),
    assists: happened('assist'),
    card: red && yellow ? 'second-yellow' : red ? 'red' : yellow ? 'yellow' : null,
  };
}

function lineup(team: FmTeamLineup | undefined): ReportLineup | null {
  if (!team?.starters?.length) return null;
  return {
    formation: team.formation || null,
    coach: team.coach?.name || null,
    starters: team.starters.map((p) => player(p, true)),
    subs: (team.subs ?? []).map((p) => player(p, false)),
  };
}

function lineups(match: FmMatch): MatchReport['lineups'] {
  const l = match.content?.lineup;
  if (!l || l.lineupType === 'predicted') return null;
  const home = lineup(l.homeTeam);
  const away = lineup(l.awayTeam);
  return home && away ? { home, away } : null;
}

function momentum(match: FmMatch): MomentumPoint[] | null {
  const data = match.content?.momentum?.main?.data;
  if (!Array.isArray(data) || !data.length) return null;
  return data
    .filter((p) => typeof p.minute === 'number' && typeof p.value === 'number')
    .map((p) => ({ minute: p.minute, value: p.value }));
}

/** The football-data report with everything FotMob knows about the match added. */
export function withFotMob(report: MatchReport, match: FmMatch): MatchReport {
  const finished = match.general?.finished ?? match.header?.status?.finished;
  if (!finished) return report;
  const teams = match.content?.lineup;
  const names = new Map<number, string>();
  for (const p of [
    ...(teams?.homeTeam?.starters ?? []),
    ...(teams?.homeTeam?.subs ?? []),
    ...(teams?.awayTeam?.starters ?? []),
    ...(teams?.awayTeam?.subs ?? []),
  ]) {
    names.set(p.id, p.name);
  }
  const info = match.content?.matchFacts?.infoBox;
  return {
    ...report,
    venue: report.venue ?? info?.Stadium?.name ?? null,
    attendance: report.attendance ?? info?.Attendance ?? null,
    referee: report.referee ?? info?.Referee?.text ?? null,
    injuryTime: addedTime(match, 90) ?? report.injuryTime,
    firstHalfInjuryTime: addedTime(match, 45) ?? report.firstHalfInjuryTime,
    events: events(match, names) ?? report.events,
    stats: stats(match) ?? report.stats,
    momentum: momentum(match),
    lineups: lineups(match),
    bestPlayer: match.content?.matchFacts?.playerOfTheMatch?.id ?? null,
  };
}

// The source ---------------------------------------------------------------------------------

export function createFotMobFetcher(baseUrl = FOTMOB_BASE_URL): Fetcher {
  // English, so the few phrases FotMob sends as text ("assist by …") read the same every time.
  return (path) => fetch(new URL(path, baseUrl), { headers: { 'Accept-Language': 'en' } });
}

export function createFotMob({
  fetcher,
  cache,
  now,
}: {
  fetcher: Fetcher;
  cache: FootballDataCache;
  now: () => number;
}): MatchDetails {
  const readThrough = createReadThrough({ name: 'fotmob', fetcher, cache, now });

  async function find(key: MatchKey): Promise<number | null> {
    for (const day of daysAround(key.utcDate)) {
      const list = await readThrough<FmDay>(
        `fotmob-day-${day}`,
        `/api/data/matches?date=${day}`,
        'Failed to fetch FotMob matches',
      );
      // Without the kickoff day there's nothing to find the match in.
      if (!list.data) return null;
      const match = findMatch(list.data, key);
      if (match) return match.id;
    }
    return null;
  }

  return {
    async enrich(source, report) {
      const id = await find(keyOf(source));
      if (id === null) {
        console.info(`[fotmob] no match for ${source.id} (${source.homeTeam.name} v ${source.awayTeam.name})`);
        return report;
      }
      const details = await readThrough<FmMatch>(
        `fotmob-match-${id}`,
        `/api/data/matchDetails?matchId=${id}`,
        'Failed to fetch FotMob match',
      );
      return details.data ? withFotMob(report, details.data) : report;
    },
  };
}
