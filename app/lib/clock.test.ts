import * as assert from 'remix/assert';
import { it } from 'remix/test';
import { execFileSync } from 'node:child_process';
import { NOW, buildClubMatches } from '../fixtures/builders.ts';
import { alignedNow, timeZoneFromCookie, timeZoneCookie } from './clock.ts';
import { MAX_AGE_MS } from './freshness.ts';
import { MatchesModel } from '../actions/public/clubs/matches.ts';

it('keeps server formatting across runtime timezone changes', () => {
  const source = `import { time, day } from './app/lib/match-format.ts';
    const date = new Date(${NOW} + 11.5 * 3600000);
    const clock = { now: ${NOW}, timeZone: 'UTC' };
    console.log(day(date, clock), time(date, clock));`;
  for (const TZ of ['UTC', 'Europe/Madrid']) {
    const result = execFileSync(
      process.execPath,
      ['--import', 'remix/node-tsx', '--input-type=module', '-e', source],
      { env: { ...process.env, TZ }, encoding: 'utf8' },
    );
    assert.equal(result.trim(), 'Sun 23:30');
  }
});

it('validates timezone cookies and uses the Your clubs cookie attributes', () => {
  assert.equal(timeZoneFromCookie('Europe/Madrid'), 'Europe/Madrid');
  for (const value of [undefined, '', 'bad-zone', '+01:00']) {
    assert.equal(timeZoneFromCookie(value), 'UTC');
  }
  assert.equal(timeZoneCookie('Europe/Madrid'), 'otp_tz=Europe/Madrid; Path=/; Max-Age=34560000; SameSite=Lax');
});

it('anchors freshness to the server despite device clock skew in either direction', () => {
  for (const skew of [-7 * 86400000, 7 * 86400000]) {
    let deviceNow = NOW + skew;
    const now = alignedNow({ now: NOW, timeZone: 'UTC' }, () => deviceNow);
    let requests = 0;
    const model = new MatchesModel([buildClubMatches()], {
      now,
      fetch: () => { requests++; return new Promise<Response>(() => {}); },
    });
    assert.equal(now(), NOW);
    model.load(57);
    assert.equal(requests, 0);
    deviceNow += MAX_AGE_MS;
    model.load(57);
    assert.equal(requests, 1);
  }
});

it('keeps a dev clock pinned as the device clock advances', () => {
  let deviceNow = NOW + 1000;
  const now = alignedNow({ now: NOW, timeZone: 'UTC', pinned: true }, () => deviceNow);
  deviceNow += MAX_AGE_MS;
  assert.equal(now(), NOW);
});
