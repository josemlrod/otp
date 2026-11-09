import type { FootballDataFetcher } from './football-data.ts';

export function createHttpFetcher(apiKey: string, baseUrl: string): FootballDataFetcher {
  return (path) => fetch(new URL(path, baseUrl), { headers: { 'X-Auth-Token': apiKey } });
}
