import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tryCatch } from './utils.ts';

const CACHE_DIR = path.join(process.cwd(), 'tmp', 'cache');

function cachePath(key: string) {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

export async function hasCache(key: string) {
  const [stats] = await tryCatch(stat(cachePath(key)));
  return stats !== null && stats.size > 0;
}

export async function readCache<T>(key: string): Promise<T | null> {
  const [contents] = await tryCatch(readFile(cachePath(key), 'utf8'));
  if (!contents) return null;

  try {
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T) {
  if (await hasCache(key)) return false;

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(key), JSON.stringify(data, null, 2), 'utf8');
  return true;
}
