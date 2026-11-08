import type { Outcome, Venue } from './team-card.ts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const day = (date: Date) => DAYS[date.getDay()]!;
export const time = (date: Date) => date.toTimeString().slice(0, 5);
export const shortDate = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

export function ordinal(n: number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

export const resultWord: Record<Outcome, string> = { W: 'Won', D: 'Drew', L: 'Lost' };

export const versus = (venue: Venue, opponent: string) =>
  `${venue === 'H' ? 'vs' : 'at'} ${opponent}`;

// Days and hours until kickoff, or hours and minutes on the day.
export function countdown(date: Date, now = Date.now()): Array<[number, string]> {
  const minutes = Math.max(0, Math.round((date.getTime() - now) / MINUTE_MS));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days
    ? [[days, 'd'], [hours, 'h']]
    : [[hours, 'h'], [minutes % 60, 'm']];
}

// The one-line row's lead: "2d", or "5h" on the day.
export function soon(date: Date, now = Date.now()) {
  const days = Math.floor((date.getTime() - now) / DAY_MS);
  const hours = Math.floor((date.getTime() - now) / HOUR_MS);
  return days > 0 ? `${days}d` : `${hours}h`;
}
