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
    assert.equal((await selected.footballData.trackedCompetitions()).standings.length, 6);
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

it('pins render, scenario dates and cache timestamps to OTP_NOW', async () => {
  const selected = footballDataFromEnv(
    { OTP_SCENARIO: 'matchday', OTP_NOW: new Date(NOW).toISOString(), OTP_TZ: 'Europe/London' },
    { db, now: () => NOW + 86400000 },
  );
  assert.equal(selected.clock.now(), NOW);
  assert.equal(selected.clock.pinned, true);
  assert.equal(selected.clock.timeZone, 'Europe/London');
  const result = await selected.footballData.clubCard(57);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.card.fetchedAt, NOW);
});

it('rejects time overrides in production independently of scenarios', () => {
  for (const env of [{ OTP_NOW: new Date(NOW).toISOString() }, { OTP_TZ: 'UTC' }]) {
    assert.throws(
      () => footballDataFromEnv({ ...env, NODE_ENV: 'production' }, dependencies),
      /cannot be used with NODE_ENV=production/,
    );
  }
});

it('rejects invalid time overrides at startup', () => {
  for (const OTP_NOW of ['', 'tomorrow', '2026-02-30T12:00:00Z', '2026-11-08', '2026-11-08T12:00:00']) {
    assert.throws(() => footballDataFromEnv({ OTP_NOW }, dependencies), /OTP_NOW must be a valid ISO instant/);
  }
  for (const OTP_TZ of ['', 'bad-zone', '+01:00']) {
    assert.throws(() => footballDataFromEnv({ OTP_TZ }, dependencies), /OTP_TZ must be a valid IANA timezone/);
  }
});
