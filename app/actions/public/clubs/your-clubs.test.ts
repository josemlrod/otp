import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { buildStandings, buildTeam } from '../../../fixtures/builders.ts';
import { clubSections } from '../../../lib/clubs.ts';
import { resolveYourClubs } from '../../../lib/your-clubs.ts';
import { YourClubsModel } from './your-clubs.ts';

const sections = clubSections([
  buildStandings('PL', {
    clubs: [buildTeam({ id: 57 }), buildTeam({ id: 61 }), buildTeam({ id: 64 })],
  }),
]);

function setup(ids: number[] = [57], complete = true) {
  const saves: number[][] = [];
  const loads: number[] = [];
  const events: number[][] = [];
  const model = new YourClubsModel(resolveYourClubs(ids, sections, complete), sections, {
    save: (ids) => {
      saves.push(ids);
    },
    load: (id) => {
      loads.push(id);
    },
  });
  model.addEventListener('change', () => {
    events.push(model.current.savedIds);
  });
  model.beginEdit();
  return {
    model,
    saves,
    loads,
    events,
  };
}

describe('Your clubs model', () => {
  it('saves edits, loads only newly followed clubs and emits the new list', () => {
    const { model, saves, loads, events } = setup();
    model.setDraft([57, 61]);
    model.commit();
    assert.deepEqual(saves, [[57, 61]]);
    assert.deepEqual(loads, [61]);
    assert.deepEqual(events, [[57, 61]]);
    assert.deepEqual(
      model.current.clubs.map((club) => club.id),
      [57, 61],
    );
  });

  it('does nothing when an edit has no change, including a repeated close', () => {
    const { model, saves, loads, events } = setup();
    model.setDraft([57]);
    model.commit();
    model.commit();
    assert.deepEqual(saves, []);
    assert.deepEqual(loads, []);
    assert.deepEqual(events, []);
  });

  it('removes a club without loading matches', () => {
    const { model, saves, loads } = setup([57, 61]);
    model.setDraft([61]);
    model.commit();
    assert.deepEqual(saves, [[61]]);
    assert.deepEqual(loads, []);
  });

  it('keeps the selected order when reordering clubs', () => {
    const { model, saves, loads } = setup([57, 61, 64]);
    model.setDraft([64, 57, 61]);
    model.commit();
    assert.deepEqual(saves, [[64, 57, 61]]);
    assert.deepEqual(
      model.current.clubs.map((club) => club.id),
      [64, 57, 61],
    );
    assert.deepEqual(loads, []);
  });

  it('preserves Bayern after adding Arsenal during a partial outage', () => {
    const { model, saves, loads } = setup([61, 5], false);
    model.setDraft([61, 57]);
    model.commit();
    assert.deepEqual(saves, [[61, 57, 5]]);
    assert.deepEqual(loads, [57]);
    model.beginEdit();
    model.setDraft([]);
    model.commit();
    assert.deepEqual(saves, [[61, 57, 5], [5]]);
    assert.equal(model.current.unavailable, true);
  });

  it('beginEdit resets a stale draft to the current clubs', () => {
    const { model, saves, events } = setup();
    model.setDraft([61]);
    model.beginEdit();
    model.commit();
    assert.deepEqual(saves, []);
    assert.deepEqual(events, []);
  });
});
