/** Shared server and browser cache lifetime, per docs/adr/0001-football-data-read-through-cache.md. */
export const MAX_AGE_MS = 60 * 60 * 1000;

/** ADR-0001: data becomes stale at exactly one hour. */
export function isFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < MAX_AGE_MS;
}
