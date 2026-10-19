import * as assert from 'remix/assert';
import { beforeAll, describe, it } from 'remix/test';

import { migrateDatabase } from '../db.ts';
import { readCache, writeCache } from './api-cache.ts';

describe('api cache', () => {
  beforeAll(() => migrateDatabase());

  it('returns null for a missing key', async () => {
    assert.equal(await readCache('missing'), null);
  });

  it('round-trips data with its fetch time', async () => {
    await writeCache('round-trip', { table: [1, 2, 3] }, 1000);

    assert.deepEqual(await readCache('round-trip'), {
      data: { table: [1, 2, 3] },
      fetchedAt: 1000,
    });
  });

  it('overwrites an existing entry', async () => {
    await writeCache('overwrite', { version: 1 }, 1000);
    await writeCache('overwrite', { version: 2 }, 2000);

    assert.deepEqual(await readCache('overwrite'), {
      data: { version: 2 },
      fetchedAt: 2000,
    });
  });
});
