import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { buildClubMatches, buildTeam, NOW } from '../../../fixtures/builders.ts';
import { MAX_AGE_MS } from '../../../lib/freshness.ts';
import type { ClubMatches } from '../../../lib/club-matches.ts';
import { routes } from '../../../routes.ts';
import { MatchesModel, type MatchesEntry } from './matches.ts';

function setup(seed: ClubMatches[] = []) {
  let time = NOW;
  const requests: {
    url: Parameters<typeof fetch>[0];
    resolve: (response: Response) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  const events: { clubId: number; entry: MatchesEntry | undefined }[] = [];
  const model = new MatchesModel(seed, {
    now: () => time,
    fetch: (url) => {
      const request = Promise.withResolvers<Response>();
      requests.push({ url, resolve: request.resolve, reject: request.reject });
      return request.promise;
    },
  });
  model.addEventListener('change', (event) => {
    events.push({ clubId: event.clubId, entry: model.get(event.clubId) });
  });
  return {
    model,
    requests,
    events,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

// Register before settling a request so completion follows the public change event.
function changed(model: MatchesModel) {
  return new Promise<void>((resolve) => {
    model.addEventListener('change', () => resolve(), { once: true });
  });
}

const stale = () => buildClubMatches({ now: NOW - MAX_AGE_MS, form: 'L' });

describe('matches model', () => {
  it('keeps a fresh seeded matches without fetching or dispatching change', () => {
    const matches = buildClubMatches();
    const { model, requests, events, advance } = setup([matches]);
    assert.deepEqual(model.get(matches.clubId), { status: 'ready', matches });
    advance(MAX_AGE_MS - 1);
    model.load(matches.clubId);
    assert.deepEqual(model.get(matches.clubId), { status: 'ready', matches });
    assert.deepEqual(requests, []);
    assert.deepEqual(events, []);
  });

  it('refetches at exactly one hour, retaining the old matches until ready', async () => {
    const old = stale();
    const matches = buildClubMatches({ form: 'W', fixtures: [2] });
    const { model, requests, events } = setup([old]);
    model.load(old.clubId);
    assert.deepEqual(model.get(old.clubId), { status: 'loading', matches: old });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, routes.clubMatches.href({ clubId: old.clubId }));
    const done = changed(model);
    requests[0].resolve(Response.json(matches));
    await done;
    assert.deepEqual(model.get(old.clubId), { status: 'ready', matches });
    assert.deepEqual(events, [
      { clubId: old.clubId, entry: { status: 'loading', matches: old } },
      { clubId: old.clubId, entry: { status: 'ready', matches } },
    ]);
  });

  for (const failure of ['non-OK response', 'rejected fetch']) {
    it(`keeps the previous matches ready after a ${failure}`, async () => {
      const matches = stale();
      const { model, requests, events } = setup([matches]);
      model.load(matches.clubId);
      assert.deepEqual(model.get(matches.clubId), { status: 'loading', matches });
      const done = changed(model);
      if (failure === 'rejected fetch') requests[0].reject(new Error('offline'));
      else requests[0].resolve(new Response(null, { status: 503 }));
      await done;
      assert.deepEqual(model.get(matches.clubId), { status: 'ready', matches });
      assert.deepEqual(events, [
        { clubId: matches.clubId, entry: { status: 'loading', matches } },
        { clubId: matches.clubId, entry: { status: 'ready', matches } },
      ]);
    });

    it(`retries after a ${failure} without a previous matches`, async () => {
      const matches = buildClubMatches();
      const { model, requests, events } = setup();
      assert.equal(model.get(matches.clubId), undefined);
      model.load(matches.clubId);
      assert.deepEqual(model.get(matches.clubId), { status: 'loading', matches: undefined });
      const failed = changed(model);
      if (failure === 'rejected fetch') requests[0].reject(new Error('offline'));
      else requests[0].resolve(new Response(null, { status: 503 }));
      await failed;
      assert.deepEqual(model.get(matches.clubId), { status: 'error' });
      model.load(matches.clubId);
      assert.equal(requests.length, 2);
      const recovered = changed(model);
      requests[1].resolve(Response.json(matches));
      await recovered;
      assert.deepEqual(model.get(matches.clubId), { status: 'ready', matches });
      assert.deepEqual(events, [
        { clubId: matches.clubId, entry: { status: 'loading', matches: undefined } },
        { clubId: matches.clubId, entry: { status: 'error' } },
        { clubId: matches.clubId, entry: { status: 'loading', matches: undefined } },
        { clubId: matches.clubId, entry: { status: 'ready', matches } },
      ]);
    });
  }

  it('makes one request and one loading event for concurrent loads', async () => {
    const matches = buildClubMatches();
    const { model, requests, events } = setup();
    model.load(matches.clubId);
    model.load(matches.clubId);
    assert.equal(requests.length, 1);
    assert.equal(events.length, 1);
    const done = changed(model);
    requests[0].resolve(Response.json(matches));
    await done;
    assert.deepEqual(model.get(matches.clubId), { status: 'ready', matches });
    assert.equal(events.length, 2);
  });

  it('changes only the requested club and identifies it in every event', async () => {
    const first = stale();
    const other = buildClubMatches({ club: buildTeam({ id: 58 }) });
    const matches = buildClubMatches({ form: 'WW' });
    const { model, requests, events } = setup([first, other]);
    model.load(first.clubId);
    assert.deepEqual(model.get(other.clubId), { status: 'ready', matches: other });
    const done = changed(model);
    requests[0].resolve(Response.json(matches));
    await done;
    assert.deepEqual(model.get(other.clubId), { status: 'ready', matches: other });
    assert.deepEqual(events, [
      { clubId: first.clubId, entry: { status: 'loading', matches: first } },
      { clubId: first.clubId, entry: { status: 'ready', matches } },
    ]);
  });
});
