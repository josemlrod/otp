import { apiCache } from '../data/tables.ts';
import type { db as database } from '../db.ts';

export type CacheEntry<T> = { data: T; fetchedAt: number };

export interface FootballDataCache {
  read<T>(key: string): Promise<CacheEntry<T> | null>;
  write<T>(key: string, data: T, fetchedAt: number): Promise<void>;
}

export function createSqliteCache(db: typeof database): FootballDataCache {
  return {
    async read<T>(key: string): Promise<CacheEntry<T> | null> {
      const row = await db.find(apiCache, key);
      if (!row) return null;

      try {
        return { data: JSON.parse(row.data) as T, fetchedAt: row.fetched_at };
      } catch {
        return null;
      }
    },
    async write<T>(key: string, data: T, fetchedAt: number) {
      await db.query(apiCache).upsert({ key, data: JSON.stringify(data), fetched_at: fetchedAt });
    },
  };
}

export function createMemoryCache(): FootballDataCache {
  const entries = new Map<string, CacheEntry<unknown>>();
  return {
    async read<T>(key: string) {
      const entry = entries.get(key);
      return entry ? (structuredClone(entry) as CacheEntry<T>) : null;
    },
    async write(key, data, fetchedAt) {
      entries.set(key, structuredClone({ data, fetchedAt }));
    },
  };
}
