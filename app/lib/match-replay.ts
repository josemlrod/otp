import type { MatchReport, MomentumPoint, Pair, ReportEvent, Side } from './match-report.ts';

// The match as a timeline, built only from the minute-stamped events. `t` is a position on the
// match clock in minutes, with added time laid out in place: the first half runs 0 → half,
// the second half half → end. The API stamps second-half added time on the match; first-half
// added time comes from the announcement when the source has it (FotMob) and otherwise only
// from events, so a quiet first-half stoppage can come out a little short.

export type Moment = ReportEvent & { t: number };

export type GameState = { from: number; to: number; score: Pair; lead: number };

/** Momentum at a point on the match clock, -100 (away on top) to 100 (home on top). */
export type Swing = { t: number; value: number };

export type Replay = {
  half: number;
  end: number;
  moments: Moment[];
  /** "45+2'" for a point on the clock. */
  label: (t: number) => string;
  scoreAt: (t: number) => Pair;
  /** Stretches between goals, and who was ahead in each (lead > 0: home, < 0: away). */
  states: GameState[];
  /** Minutes each side had spent in front by t. */
  timeInFront: (t: number) => Pair;
  /** One sentence for what mattered at t: a goal just in, a red card, or the state of the game. */
  captionAt: (t: number) => string;
  /** The goal or card closest to t within `within` minutes, for snapping a loose scrub. */
  snap: (t: number, within?: number) => number | null;
  /** Who was on top minute by minute, on the match clock, or null when the source has none. */
  momentum: Swing[] | null;
  /** Minutes each side had the upper hand by t, from momentum (zeros without it). */
  timeOnTop: (t: number) => Pair;
};

/** "Bukayo Saka" → "Saka", "Virgil van Dijk" → "van Dijk", "Mata" → "Mata". */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

export function momentLabel(event: Pick<ReportEvent, 'minute' | 'injuryTime'>) {
  return event.injuryTime ? `${event.minute}+${event.injuryTime}'` : `${event.minute}'`;
}

const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), 0);
const GOAL_WINDOW = 4;
const CARD_WINDOW = 3;

export function replayOf(report: MatchReport): Replay | null {
  const events = report.events;
  if (!events) return null;
  const regular = report.duration === 'REGULAR';

  const firstAdded = max([
    report.firstHalfInjuryTime ?? 0,
    ...events.filter((e) => e.minute <= 45).map((e) => e.injuryTime ?? 0),
  ]);
  const secondAdded =
    report.injuryTime ??
    max([
      ...events.filter((e) => e.minute > 45 && e.minute <= 90).map((e) => e.injuryTime ?? 0),
      ...(regular ? events.filter((e) => e.minute > 90).map((e) => e.minute - 90) : []),
    ]);
  const half = 45 + firstAdded;
  const fullTime = half + 45 + secondAdded;

  const toT = (minute: number, injury: number | null) => {
    const extra = injury ?? 0;
    if (minute <= 45) return minute + extra;
    if (minute <= 90) return half + (minute - 45) + extra;
    // Past 90 with no stamp: added time in a regular match, extra time otherwise.
    return regular ? half + 45 + (minute - 90) + extra : fullTime + (minute - 90) + extra;
  };

  const moments: Moment[] = events.map((e) => ({ ...e, t: toT(e.minute, e.injuryTime) }));
  const end = Math.max(regular ? fullTime : fullTime + 30, ...moments.map((m) => m.t));

  const label = (t: number) => {
    const up = (n: number) => Math.max(1, Math.ceil(n - 1e-9));
    if (t <= 45) return `${up(t)}'`;
    if (t <= half) return `45+${up(t - 45)}'`;
    if (t <= half + 45) return `${45 + up(t - half)}'`;
    if (regular || t <= fullTime) return `90+${up(t - half - 45)}'`;
    const et = t - fullTime;
    return et <= 30 ? `${90 + up(et)}'` : `120+${up(et - 30)}'`;
  };

  const goals = moments.filter((m): m is Moment & { kind: 'goal' } => m.kind === 'goal');
  const scoreAt = (t: number): Pair => {
    let score: Pair = [0, 0];
    for (const g of goals) if (g.t <= t) score = g.score;
    return score;
  };

  const states: GameState[] = [];
  {
    let from = 0;
    let score: Pair = [0, 0];
    for (const g of goals) {
      if (g.t > from) states.push({ from, to: g.t, score, lead: score[0] - score[1] });
      from = g.t;
      score = g.score;
    }
    if (end > from) states.push({ from, to: end, score, lead: score[0] - score[1] });
  }

  const timeInFront = (t: number): Pair => {
    const front: Pair = [0, 0];
    for (const s of states) {
      const length = Math.max(0, Math.min(t, s.to) - s.from);
      if (s.lead > 0) front[0] += length;
      if (s.lead < 0) front[1] += length;
    }
    return front;
  };

  const name = (side: Side) => report[side].name;
  const scoreText = (score: Pair) => `${score[0]}–${score[1]}`;
  const goalPhrase = (g: Moment & { kind: 'goal' }) =>
    g.goal === 'own' ? `the ${momentLabel(g)} own goal` : `${shortName(g.player)}’s ${momentLabel(g)}`;

  const captionAt = (t: number) => {
    if (t >= end - 1e-6) {
      const front = timeInFront(end);
      if (front[0] === 0 && front[1] === 0) {
        return report.fullTime[0] === 0 ? 'Goalless' : 'Never separated';
      }
      const side: Side = front[0] >= front[1] ? 'home' : 'away';
      const minutes = Math.round(front[side === 'home' ? 0 : 1]);
      return `${name(side)} led for ${minutes} of ${Math.round(end)} minutes`;
    }
    const goal = goals.findLast((g) => t >= g.t && t < g.t + GOAL_WINDOW);
    if (goal) {
      const who = shortName(goal.player);
      const what =
        goal.goal === 'own'
          ? `Own goal by ${who}`
          : goal.goal === 'penalty'
            ? `${who} scores a penalty`
            : `${who} scores${goal.assist ? `, from ${shortName(goal.assist)}` : ''}`;
      return `${what} · ${scoreText(goal.score)}`;
    }
    const red = moments.findLast(
      (m) => m.kind === 'card' && m.card !== 'yellow' && t >= m.t && t < m.t + CARD_WINDOW,
    );
    if (red?.kind === 'card') {
      return `${shortName(red.player)} sent off${red.card === 'second-yellow' ? ', a second yellow' : ''}`;
    }
    const state = states.find((s) => t >= s.from && t < s.to) ?? states.at(-1)!;
    const last = goals.findLast((g) => g.t <= t);
    if (state.lead === 0) return last ? `Level since ${goalPhrase(last)}` : 'Goalless so far';
    return `${name(state.lead > 0 ? 'home' : 'away')} ahead since ${goalPhrase(last!)}`;
  };

  const snap = (t: number, within = 1.6) => {
    let best: number | null = null;
    for (const m of moments) {
      if (m.kind === 'sub' || Math.abs(m.t - t) >= within) continue;
      if (best === null || Math.abs(m.t - t) < Math.abs(best - t)) best = m.t;
    }
    return best;
  };

  const momentum = report.momentum ? swingsOf(report.momentum, { half, fullTime, end, regular }) : null;

  const timeOnTop = (t: number): Pair => {
    const top: Pair = [0, 0];
    if (!momentum) return top;
    // Each point closes the minute before it, so a stretch belongs to the value at its end.
    for (let i = 1; i < momentum.length; i++) {
      const { t: to, value } = momentum[i]!;
      const length = Math.max(0, Math.min(t, to) - momentum[i - 1]!.t);
      if (value > 0) top[0] += length;
      if (value < 0) top[1] += length;
    }
    return top;
  };

  return { half, end, moments, label, scoreAt, states, timeInFront, captionAt, snap, momentum, timeOnTop };
}

type Clock = { half: number; fullTime: number; end: number; regular: boolean };

/**
 * FotMob's momentum on the replay clock. Whole minutes map like events do. Added time comes as
 * fractions after the minute it follows (45.5, or 90.5 and 90.75), so those points are spread
 * evenly across the added time the clock lays out, the last one landing on the whistle.
 * Extra-time stoppages aren't laid out on the clock, so their points fold onto the minute.
 */
export function swingsOf(points: MomentumPoint[], clock: Clock): Swing[] | null {
  const { half, fullTime, end, regular } = clock;
  const whole = (minute: number) => {
    if (minute <= 45) return minute;
    if (minute <= 90) return half + (minute - 45);
    // Past 90 as a whole minute: added time in a regular match, extra time otherwise.
    return regular ? half + 45 + (minute - 90) : fullTime + (minute - 90);
  };
  const spans: Record<number, [number, number]> = { 45: [45, half], 90: [half + 45, fullTime] };

  const sorted = [...points].sort((a, b) => a.minute - b.minute);
  const added = new Map<number, number[]>();
  for (const p of sorted) {
    if (Number.isInteger(p.minute)) continue;
    const base = Math.floor(p.minute);
    added.set(base, [...(added.get(base) ?? []), p.minute]);
  }

  const swings: Swing[] = [];
  for (const p of sorted) {
    let t: number;
    if (Number.isInteger(p.minute)) {
      t = whole(p.minute);
    } else {
      const base = Math.floor(p.minute);
      const [from, to] = spans[base] ?? [whole(base), whole(base)];
      const run = added.get(base)!;
      t = from + ((to - from) * (run.indexOf(p.minute) + 1)) / run.length;
    }
    const value = Math.max(-100, Math.min(100, p.value));
    // Points that land on the same instant (no added time to spread over) keep the latest.
    if (swings.length && t <= swings.at(-1)!.t + 1e-9) {
      swings[swings.length - 1] = { t: swings.at(-1)!.t, value };
      continue;
    }
    if (t > end + 1e-9) break;
    swings.push({ t, value });
  }
  return swings.length > 1 ? swings : null;
}
