import * as assert from 'remix/assert';
import { it } from 'remix/test';
import { db, migrateDatabase } from '../db.ts';
import { buildStandings, NOW } from '../fixtures/builders.ts';
import { createSqliteCache } from './api-cache.ts';

it('SQLite cache round-trips data and timestamp through the migrated database', async () => {
  await migrateDatabase();
  const cache = createSqliteCache(db);
  const data = buildStandings('PL');
  assert.equal(await cache.read('adapter-roundtrip'), null);
  await cache.write('adapter-roundtrip', data, NOW);
  assert.deepEqual(await cache.read('adapter-roundtrip'), { data, fetchedAt: NOW });
});
