import type { Clock } from './clock.ts';
import type { Outcome, Venue } from './club-matches.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Every date is formatted in the clock's timezone, never the runtime's.
const format = (date: Date | number, clock: Clock, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: clock.timeZone }).format(date);

// "Sun"
export const day = (date: Date, clock: Clock) => format(date, clock, { weekday: 'short' });

// "19:30"
export const time = (date: Date, clock: Clock) =>
  format(date, clock, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// "8 Nov"
export const shortDate = (date: Date, clock: Clock) =>
  format(date, clock, { day: 'numeric', month: 'short' });

// "Sunday 8 November", for the header.
export const today = (clock: Clock) =>
  format(clock.now, clock, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');

export function ordinal(n: number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

export const resultWord: Record<Outcome, string> = { W: 'Won', D: 'Drew', L: 'Lost' };

export const versus = (venue: Venue, opponent: string) =>
  `${venue === 'H' ? 'vs' : 'at'} ${opponent}`;

// Days and hours until kickoff, or hours and minutes on the day.
export function countdown(date: Date, clock: Clock): Array<[number, string]> {
  const minutes = Math.max(0, Math.round((date.getTime() - clock.now) / MINUTE_MS));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days
    ? [[days, 'd'], [hours, 'h']]
    : [[hours, 'h'], [minutes % 60, 'm']];
}

// The one-line row's lead: "2d", or "5h" on the day.
export function soon(date: Date, clock: Clock) {
  const days = Math.floor((date.getTime() - clock.now) / DAY_MS);
  const hours = Math.floor((date.getTime() - clock.now) / HOUR_MS);
  return days > 0 ? `${days}d` : `${hours}h`;
}
