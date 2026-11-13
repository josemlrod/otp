import { scenarioFetcher } from '../fixtures/scenarios.ts';
import { createMemoryCache, createSqliteCache } from './api-cache.ts';
import { parseInstant, validTimeZone, type ClockSource } from './clock.ts';
import type { db as database } from '../db.ts';
import { createFootballData } from './football-data.ts';
import { createHttpFetcher } from './football-data-http.ts';
import { createFotMob, createFotMobFetcher } from './fotmob.ts';

type Environment = {
  OTP_SCENARIO?: string;
  OTP_NOW?: string;
  OTP_TZ?: string;
  NODE_ENV?: string;
  FOOTBALL_DATA_API_KEY?: string;
};

export function footballDataFromEnv(
  env: Environment,
  { db, now }: { db: typeof database; now: () => number },
) {
  for (const key of ['OTP_SCENARIO', 'OTP_NOW', 'OTP_TZ'] as const) {
    if (env[key] !== undefined && env.NODE_ENV === 'production') {
      throw new Error(`${key} cannot be used with NODE_ENV=production`);
    }
  }
  const instant = env.OTP_NOW === undefined ? undefined : parseInstant(env.OTP_NOW);
  if (instant === null) {
    throw new Error('OTP_NOW must be a valid ISO instant with a timezone');
  }
  if (env.OTP_TZ !== undefined && !validTimeZone(env.OTP_TZ)) {
    throw new Error('OTP_TZ must be a valid IANA timezone');
  }
  const readNow = instant === undefined ? now : () => instant;
  const clock: ClockSource = { now: readNow, pinned: instant !== undefined, timeZone: env.OTP_TZ };
  const scenario = env.OTP_SCENARIO;
  const fetcher =
    scenario !== undefined
      ? scenarioFetcher(scenario, readNow())
      : createHttpFetcher(env.FOOTBALL_DATA_API_KEY ?? '', 'https://api.football-data.org');
  const cache = scenario !== undefined ? createMemoryCache() : createSqliteCache(db);
  // Scenarios answer from fixtures alone, so they never reach FotMob.
  const details =
    scenario !== undefined
      ? undefined
      : createFotMob({ fetcher: createFotMobFetcher(), cache, now: readNow });
  return {
    clock,
    footballData: createFootballData({ fetcher, cache, now: readNow, details }),
    scenario,
    shouldMigrate: scenario === undefined,
    fetcher,
    cache,
  };
}
