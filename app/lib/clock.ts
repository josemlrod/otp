// The instant and timezone a home render formats with. The server creates one per render and
// serializes it, so the first client render formats exactly what the server did.
export type Clock = {
  now: number;
  timeZone: string;
  /** Dev only (OTP_NOW): the browser keeps this instant instead of advancing. */
  pinned?: boolean;
  /** Dev only (OTP_TZ): the browser keeps this timezone instead of its own. */
  timeZonePinned?: boolean;
};

// How the server reads time: the system clock, or a fixed instant and timezone in dev.
export type ClockSource = { now: () => number; pinned: boolean; timeZone?: string };

export const TIME_ZONE_COOKIE = 'otp_tz';
const TIME_ZONE_MAX_AGE_S = 400 * 24 * 60 * 60;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// An ISO instant with Z or an explicit offset. Rejects dates Date.parse would roll over (Feb 30).
export function parseInstant(value: string): number | null {
  const instant = Date.parse(value);
  const date = value.slice(0, 10);
  const calendarDate = new Date(`${date}T00:00:00Z`);
  const isRealDate =
    Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().startsWith(date);
  return ISO_INSTANT.test(value) && Number.isFinite(instant) && isRealDate ? instant : null;
}

export function validTimeZone(value: string): boolean {
  if (!value || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneFromCookie(value: string | null | undefined): string {
  return value && validTimeZone(value) ? value : 'UTC';
}

export function timeZoneCookie(timeZone: string): string {
  return `${TIME_ZONE_COOKIE}=${timeZone}; Path=/; Max-Age=${TIME_ZONE_MAX_AGE_S}; SameSite=Lax`;
}

// Anchor once, so a wrongly set device clock cannot skew server-stamped freshness.
export function alignedNow(clock: Clock, readNow: () => number): () => number {
  const offset = clock.now - readNow();
  return clock.pinned ? () => clock.now : () => readNow() + offset;
}
