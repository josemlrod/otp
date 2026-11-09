import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { db } from '../db.ts';
import { NOW } from '../fixtures/builders.ts';
import { footballDataFromEnv } from './football-data-env.ts';

const dependencies = { db, now: () => NOW };

describe('football data startup selection', () => {
  it('rejects scenarios in production', () => {
    assert.throws(
      () =>
        footballDataFromEnv(
          {
            NODE_ENV: 'production',
            OTP_SCENARIO: 'matchday',
          },
          dependencies,
        ),
      /cannot be used with NODE_ENV=production/,
    );
  });

  it('rejects unknown scenarios with the available names', () => {
    assert.throws(
      () => footballDataFromEnv({ OTP_SCENARIO: 'unknown' }, dependencies),
      /Valid scenarios: matchday, api-down, no-fixtures/,
    );
  });

  it('uses scenario responses and an independent memory cache without migrations', async () => {
    const selected = footballDataFromEnv({ OTP_SCENARIO: 'matchday' }, dependencies);
    assert.equal(selected.scenario, 'matchday');
    assert.equal(selected.shouldMigrate, false);
    assert.equal((await selected.footballData.standings()).length, 6);
    await selected.cache.write('startup-test', 'memory', NOW);
    const other = footballDataFromEnv({ OTP_SCENARIO: 'matchday' }, dependencies);
    assert.equal(await other.cache.read('startup-test'), null);
  });

  it('selects the HTTP fetcher and SQLite cache with migrations by default', async () => {
    // Neither adapter is invoked: startup selection must make no network request.
    const selected = footballDataFromEnv({ FOOTBALL_DATA_API_KEY: 'test-key' }, dependencies);
    assert.equal(selected.scenario, undefined);
    assert.equal(selected.shouldMigrate, true);
    assert.match(selected.fetcher.toString(), /fetch\(new URL/);
    assert.match(selected.fetcher.toString(), /X-Auth-Token/);
    assert.match(selected.cache.read.toString(), /db.find/);
  });

  it('defaults the HTTP API key to an empty string', () => {
    const selected = footballDataFromEnv({}, dependencies);
    assert.equal(selected.shouldMigrate, true);
    assert.equal(typeof selected.footballData.clubCard, 'function');
  });
});
