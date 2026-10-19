import { apiCache } from '../data/tables.ts';
import { db } from '../db.ts';

export type CacheEntry<T> = { data: T; fetchedAt: number };

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const row = await db.find(apiCache, key);
  if (!row) return null;

  try {
    return { data: JSON.parse(row.data) as T, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T, fetchedAt = Date.now()) {
  await db
    .query(apiCache)
    .upsert({ key, data: JSON.stringify(data), fetched_at: fetchedAt });
}
