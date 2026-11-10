import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { buildClubCard, buildTeam, NOW } from '../../../fixtures/builders.ts';
import { MAX_AGE_MS } from '../../../lib/freshness.ts';
import type { TeamCard } from '../../../lib/team-card.ts';
import { routes } from '../../../routes.ts';
import { MatchesModel, type MatchesEntry } from './matches.ts';

function setup(seed: TeamCard[] = []) {
  let time = NOW;
  const requests: {
    url: Parameters<typeof fetch>[0];
    resolve: (response: Response) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  const events: { teamId: number; entry: MatchesEntry | undefined }[] = [];
  const model = new MatchesModel(seed, {
    now: () => time,
    fetch: (url) => {
      const request = Promise.withResolvers<Response>();
      requests.push({ url, resolve: request.resolve, reject: request.reject });
      return request.promise;
    },
  });
  model.addEventListener('change', (event) => {
    events.push({ teamId: event.teamId, entry: model.get(event.teamId) });
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

const stale = () => buildClubCard({ now: NOW - MAX_AGE_MS, form: 'L' });

describe('matches model', () => {
  it('keeps a fresh seeded card without fetching or dispatching change', () => {
    const card = buildClubCard();
    const { model, requests, events, advance } = setup([card]);
    assert.deepEqual(model.get(card.teamId), { status: 'ready', card });
    advance(MAX_AGE_MS - 1);
    model.load(card.teamId);
    assert.deepEqual(model.get(card.teamId), { status: 'ready', card });
    assert.deepEqual(requests, []);
    assert.deepEqual(events, []);
  });

  it('refetches at exactly one hour, retaining the old card until ready', async () => {
    const old = stale();
    const card = buildClubCard({ form: 'W', fixtures: [2] });
    const { model, requests, events } = setup([old]);
    model.load(old.teamId);
    assert.deepEqual(model.get(old.teamId), { status: 'loading', card: old });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, routes.teamMatches.href({ teamId: old.teamId }));
    const done = changed(model);
    requests[0].resolve(Response.json(card));
    await done;
    assert.deepEqual(model.get(old.teamId), { status: 'ready', card });
    assert.deepEqual(events, [
      { teamId: old.teamId, entry: { status: 'loading', card: old } },
      { teamId: old.teamId, entry: { status: 'ready', card } },
    ]);
  });

  for (const failure of ['non-OK response', 'rejected fetch']) {
    it(`keeps the previous card ready after a ${failure}`, async () => {
      const card = stale();
      const { model, requests, events } = setup([card]);
      model.load(card.teamId);
      assert.deepEqual(model.get(card.teamId), { status: 'loading', card });
      const done = changed(model);
      if (failure === 'rejected fetch') requests[0].reject(new Error('offline'));
      else requests[0].resolve(new Response(null, { status: 503 }));
      await done;
      assert.deepEqual(model.get(card.teamId), { status: 'ready', card });
      assert.deepEqual(events, [
        { teamId: card.teamId, entry: { status: 'loading', card } },
        { teamId: card.teamId, entry: { status: 'ready', card } },
      ]);
    });

    it(`retries after a ${failure} without a previous card`, async () => {
      const card = buildClubCard();
      const { model, requests, events } = setup();
      assert.equal(model.get(card.teamId), undefined);
      model.load(card.teamId);
      assert.deepEqual(model.get(card.teamId), { status: 'loading', card: undefined });
      const failed = changed(model);
      if (failure === 'rejected fetch') requests[0].reject(new Error('offline'));
      else requests[0].resolve(new Response(null, { status: 503 }));
      await failed;
      assert.deepEqual(model.get(card.teamId), { status: 'error' });
      model.load(card.teamId);
      assert.equal(requests.length, 2);
      const recovered = changed(model);
      requests[1].resolve(Response.json(card));
      await recovered;
      assert.deepEqual(model.get(card.teamId), { status: 'ready', card });
      assert.deepEqual(events, [
        { teamId: card.teamId, entry: { status: 'loading', card: undefined } },
        { teamId: card.teamId, entry: { status: 'error' } },
        { teamId: card.teamId, entry: { status: 'loading', card: undefined } },
        { teamId: card.teamId, entry: { status: 'ready', card } },
      ]);
    });
  }

  it('makes one request and one loading event for concurrent loads', async () => {
    const card = buildClubCard();
    const { model, requests, events } = setup();
    model.load(card.teamId);
    model.load(card.teamId);
    assert.equal(requests.length, 1);
    assert.equal(events.length, 1);
    const done = changed(model);
    requests[0].resolve(Response.json(card));
    await done;
    assert.deepEqual(model.get(card.teamId), { status: 'ready', card });
    assert.equal(events.length, 2);
  });

  it('changes only the requested club and identifies it in every event', async () => {
    const first = stale();
    const other = buildClubCard({ team: buildTeam({ id: 58 }) });
    const card = buildClubCard({ form: 'WW' });
    const { model, requests, events } = setup([first, other]);
    model.load(first.teamId);
    assert.deepEqual(model.get(other.teamId), { status: 'ready', card: other });
    const done = changed(model);
    requests[0].resolve(Response.json(card));
    await done;
    assert.deepEqual(model.get(other.teamId), { status: 'ready', card: other });
    assert.deepEqual(events, [
      { teamId: first.teamId, entry: { status: 'loading', card: first } },
      { teamId: first.teamId, entry: { status: 'ready', card } },
    ]);
  });
});
