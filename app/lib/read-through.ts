import { tryCatch } from './utils.ts';
import type { FootballDataCache } from './api-cache.ts';
import { isFresh } from './freshness.ts';

// The read-through cache every upstream request goes through (ADR-0001): a fresh copy is served
// as is, a stale or missing one is refetched, and when the fetch fails the stale copy is served.
// After a failure, that key isn't fetched again for RETRY_AFTER_MS.

export const RETRY_AFTER_MS = 60_000;

export type Fetcher = (path: string) => Promise<Response>;
export type CachedResult<T> = { data: T; err: null; fetchedAt: number } | { data: null; err: string };
export type ReadThrough = <T>(key: string, path: string, errorMessage: string) => Promise<CachedResult<T>>;

type FetchResult<T> = { data: T; err: null } | { data: null; err: string };

export function createReadThrough({
  name,
  fetcher,
  cache,
  now,
}: {
  /** Prefix for log lines, e.g. "football-data". */
  name: string;
  fetcher: Fetcher;
  cache: FootballDataCache;
  now: () => number;
}): ReadThrough {
  const retryAt = new Map<string, number>();
  const log = (message: string) => console.info(`[${name}] ${message}`);
  const logError = (message: string, err?: unknown) => {
    if (err === undefined) console.error(`[${name}] ${message}`);
    else console.error(`[${name}] ${message}`, err);
  };

  async function fetchJson<T>(path: string, errorMessage: string): Promise<FetchResult<T>> {
    const start = now();
    const [response, err] = await tryCatch(fetcher(path));
    const ms = Math.round(now() - start);

    if (err) {
      logError(`GET ${path} failed after ${ms}ms`, err);
      return { data: null, err: errorMessage };
    }

    if (!response.ok) {
      logError(`GET ${path} ${response.status} ${ms}ms`);
      return { data: null, err: errorMessage };
    }
    log(`GET ${path} ${response.status} ${ms}ms`);

    const [data, parseErr] = await tryCatch(response.json() as Promise<T>);
    if (parseErr) {
      logError(`GET ${path} returned invalid JSON`, parseErr);
      return { data: null, err: errorMessage };
    }

    return { data, err: null };
  }

  return async function readThrough<T>(
    key: string,
    path: string,
    errorMessage: string,
  ): Promise<CachedResult<T>> {
    const [cached, readErr] = await tryCatch(cache.read<T>(key));
    if (readErr) logError(`cache read failed ${key}`, readErr);

    if (cached && isFresh(cached.fetchedAt, now())) {
      log(`cache hit ${key}`);
      return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
    }
    log(`${cached ? 'cache stale' : 'cache miss'} ${key}`);

    const coolingDown = now() < (retryAt.get(key) ?? -Infinity);
    if (coolingDown) log(`retry cooldown ${key}`);
    const res: FetchResult<T> = coolingDown
      ? { data: null, err: errorMessage }
      : await fetchJson<T>(path, errorMessage);
    if (res.data) {
      retryAt.delete(key);
      const fetchedAt = now();
      const [, writeErr] = await tryCatch(cache.write(key, res.data, fetchedAt));
      if (writeErr) logError(`cache write failed ${key}`, writeErr);
      return { data: res.data, err: null, fetchedAt };
    }

    if (!retryAt.has(key) || now() >= retryAt.get(key)!) {
      retryAt.set(key, now() + RETRY_AFTER_MS);
    }

    if (cached) {
      log(`serving stale ${key}`);
      return { data: cached.data, err: null, fetchedAt: cached.fetchedAt };
    }

    return { data: null, err: res.err ?? errorMessage };
  };
}
