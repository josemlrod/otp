import type { MatchReport, ReportClub, ReportPlayer, Side } from '../../../lib/match-report.ts';
import { momentLabel, shortName, type Moment, type Replay } from '../../../lib/match-replay.ts';

// One side's lineup as the match sheet draws it: the starting XI on their half of the pitch, the
// substitutes who came on (and for whom), the ones who didn't, and a short account of each
// player's match for the player card.
//
// Pitch spots are FotMob's formation slots for the starting XI, which are reliable. Substitutes
// have no spot of their own, so they're listed on the bench rather than guessed onto the pitch.

export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';

export const ROLE_NAME: Record<Role, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

export type RatingTone = 'top' | 'good' | 'ok' | 'poor' | 'none';

/** Something a player did, with the point on the match clock to jump to when there is one. */
export type PlayerEvent = {
  kind: 'goal' | 'yellow' | 'second-yellow' | 'red' | 'on' | 'off';
  text: string;
  label: string;
  t: number | null;
};

export type LineupPlayer = {
  id: number;
  name: string;
  short: string;
  shirt: string | null;
  rating: number | null;
  captain: boolean;
  /** Player of the match. */
  motm: boolean;
  starter: boolean;
  /** A starter's line, from their formation slot. Substitutes have none. */
  role: Role | null;
  /** Where a starter stands on their half of the pitch, in % of the pitch box. */
  at: { x: number; y: number } | null;
  goals: number;
  assists: number;
  card: ReportPlayer['card'];
  /** "62'" when they came on or went off. */
  on: string | null;
  off: string | null;
  sentOff: boolean;
  /** Who they came on for, and who came on for them (short names). */
  replaced: string | null;
  replacedBy: string | null;
  /** "90' played", "Off 74'", "On 62' · 28' played", "Unused". */
  minutes: string;
  events: PlayerEvent[];
  photo: string;
};

export type Lineup = {
  side: Side;
  club: ReportClub;
  formation: string | null;
  coach: string | null;
  starters: LineupPlayer[];
  /** Substitutes who came on, in the order they did. */
  used: LineupPlayer[];
  unused: LineupPlayer[];
};

export const photoOf = (id: number) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

export function ratingTone(rating: number | null): RatingTone {
  if (rating == null) return 'none';
  if (rating >= 8) return 'top';
  if (rating >= 7) return 'good';
  if (rating >= 6) return 'ok';
  return 'poor';
}

export const formatRating = (rating: number | null) => (rating == null ? '–' : rating.toFixed(1));

/** FotMob's spot height (0 at their own goal line) to a line on the pitch. */
export function roleOf(y: number): Role {
  if (y < 0.2) return 'GK';
  if (y < 0.4) return 'DEF';
  if (y < 0.75) return 'MID';
  return 'FWD';
}

/**
 * A starter's spot on one side's half, defending the bottom edge with the halfway line near the
 * top. FotMob's x runs from the team's right flank (0) to their left (1); facing up the pitch,
 * their right flank is the right of the screen. Goalkeepers sit at y≈0.1 and strikers at ≈0.87.
 */
export function onHalf(spot: { x: number; y: number }) {
  const up = clamp01((spot.y - 0.1) / 0.77);
  const across = clamp01((spot.x - 0.125) / 0.75);
  // The keeper stands high enough off the goal line that their name stays on the grass.
  return { x: round(8 + (1 - across) * 84), y: round(88 - up * 72) };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 100) / 100;

type Sub = Moment & { kind: 'sub' };

export function lineupOf(report: MatchReport, replay: Replay | null, side: Side): Lineup | null {
  const source = report.lineups?.[side];
  if (!source) return null;
  const moments = replay?.moments.filter((m) => m.side === side) ?? [];
  const length = report.duration === 'REGULAR' ? 90 : 120;
  const everyone = [...source.starters, ...source.subs];

  // Pair each substitution with the two players. Names first; when a name is spelt differently
  // in the events, the minute the lineup gives for coming on or off settles it.
  const subOn = new Map<number, Sub>();
  const subOff = new Map<number, Sub>();
  for (const m of moments) {
    if (m.kind !== 'sub') continue;
    const find = (name: string, taken: Map<number, Sub>, minute: (p: ReportPlayer) => number | null) => {
      const free = everyone.filter((p) => !taken.has(p.id));
      const byName = free.filter((p) => p.name === name);
      if (byName.length === 1) return byName[0];
      const byMinute = free.filter((p) => minute(p) === m.minute);
      return byMinute.length === 1 ? byMinute[0] : undefined;
    };
    const playerIn = find(m.playerIn, subOn, (p) => p.on);
    const playerOut = find(m.playerOut, subOff, (p) => p.off);
    if (playerIn) subOn.set(playerIn.id, m);
    if (playerOut) subOff.set(playerOut.id, m);
  }
  const shortById = new Map(everyone.map((p) => [p.id, shortName(p.name)]));
  const pairedWith = (m: Sub | undefined, map: Map<number, Sub>) => {
    if (!m) return null;
    for (const [id, other] of map) if (other === m) return shortById.get(id) ?? null;
    return null;
  };

  const decorate = (p: ReportPlayer, starter: boolean): LineupPlayer => {
    const short = shortName(p.name);
    const inMoment = subOn.get(p.id);
    const outMoment = subOff.get(p.id);
    const on = inMoment ? momentLabel(inMoment) : !starter && p.on != null ? `${p.on}'` : null;
    const off = outMoment ? momentLabel(outMoment) : p.off != null ? `${p.off}'` : null;
    // Events name players, so only trust a name the lineup agrees with (two players can share one).
    const cards = p.card
      ? moments.filter((m): m is Moment & { kind: 'card' } => m.kind === 'card' && m.player === p.name)
      : [];
    const sendOff = cards.find((c) => c.card !== 'yellow');
    const sentOff = !!sendOff || p.card === 'red' || p.card === 'second-yellow';
    const came = starter || on !== null;
    const from = starter ? 0 : (p.on ?? length);
    const until = p.off ?? (sendOff ? sendOff.minute : length);
    const played = came ? Math.max(0, Math.min(length, until) - from) : 0;
    const sentOffLabel = sendOff ? momentLabel(sendOff) : off;

    const minutes = !came
      ? 'Unused'
      : sentOff
        ? `Sent off${sentOffLabel ? ` ${sentOffLabel}` : ''}`
        : starter
          ? off ? `Off ${off}` : `${played}' played`
          : `On ${on} · ${played}' played`;

    const replaced = pairedWith(inMoment, subOff);
    const replacedBy = pairedWith(outMoment, subOn);
    const events: PlayerEvent[] = [
      ...moments
        .filter((m): m is Moment & { kind: 'goal' } => p.goals > 0 && m.kind === 'goal' && m.player === p.name && m.goal !== 'own')
        .map((m): PlayerEvent => ({ kind: 'goal', text: m.goal === 'penalty' ? 'Penalty' : 'Goal', label: momentLabel(m), t: m.t })),
      ...cards.map((m): PlayerEvent => ({
        kind: m.card,
        text: m.card === 'yellow' ? 'Yellow card' : m.card === 'red' ? 'Red card' : 'Second yellow',
        label: momentLabel(m),
        t: m.t,
      })),
      ...(inMoment ? [{ kind: 'on', text: replaced ? `On for ${replaced}` : 'Came on', label: momentLabel(inMoment), t: inMoment.t } as PlayerEvent] : []),
      ...(outMoment ? [{ kind: 'off', text: replacedBy ? `Off for ${replacedBy}` : 'Went off', label: momentLabel(outMoment), t: outMoment.t } as PlayerEvent] : []),
    ].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

    return {
      id: p.id,
      name: p.name,
      short,
      shirt: p.shirt,
      rating: p.rating,
      captain: p.captain,
      motm: report.bestPlayer === p.id,
      starter,
      role: starter && p.spot ? roleOf(p.spot.y) : null,
      at: starter && p.spot ? onHalf(p.spot) : null,
      goals: p.goals,
      assists: p.assists,
      card: p.card,
      on,
      off: sentOff ? null : off,
      sentOff,
      replaced,
      replacedBy,
      minutes,
      events,
      photo: photoOf(p.id),
    };
  };

  const starters = source.starters.map((p) => decorate(p, true));
  const subs = source.subs.map((p) => decorate(p, false));
  const onAt = (p: LineupPlayer) => {
    const m = subOn.get(p.id);
    return m ? m.t : source.subs.find((s) => s.id === p.id)?.on ?? Infinity;
  };

  return {
    side,
    club: report[side],
    formation: source.formation,
    coach: source.coach,
    starters,
    used: subs.filter((p) => p.on !== null).sort((a, b) => onAt(a) - onAt(b)),
    unused: subs.filter((p) => p.on === null),
  };
}
