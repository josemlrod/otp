import { scenarioFetcher } from '../fixtures/scenarios.ts';
import { createMemoryCache, createSqliteCache } from './api-cache.ts';
import type { db as database } from '../db.ts';
import { createFootballData } from './football-data.ts';
import { createHttpFetcher } from './football-data-http.ts';

type Environment = {
  OTP_SCENARIO?: string;
  NODE_ENV?: string;
  FOOTBALL_DATA_API_KEY?: string;
};

export function footballDataFromEnv(
  env: Environment,
  { db, now }: { db: typeof database; now: () => number },
) {
  const scenario = env.OTP_SCENARIO;
  if (scenario !== undefined && env.NODE_ENV === 'production') {
    throw new Error('OTP_SCENARIO cannot be used with NODE_ENV=production');
  }
  const fetcher =
    scenario !== undefined
      ? scenarioFetcher(scenario, now())
      : createHttpFetcher(env.FOOTBALL_DATA_API_KEY ?? '', 'https://api.football-data.org');
  const cache = scenario !== undefined ? createMemoryCache() : createSqliteCache(db);
  return {
    footballData: createFootballData({ fetcher, cache, now }),
    scenario,
    shouldMigrate: scenario === undefined,
    fetcher,
    cache,
  };
}
