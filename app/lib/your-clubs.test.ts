import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { buildStandings, buildTeam } from '../fixtures/builders.ts';
import { clubSections } from './clubs.ts';
import { resolveYourClubs } from './your-clubs.ts';

const sections = clubSections([
  buildStandings('PL', {
    clubs: [buildTeam({ id: 57 }), buildTeam({ id: 61 })],
  }),
]);

describe('resolve Your clubs', () => {
  it('keeps resolved clubs in the user order', () => {
    const result = resolveYourClubs([61, 57], sections, true);
    assert.deepEqual(
      result.clubs.map((club) => club.id),
      [61, 57],
    );
    assert.deepEqual(result.savedIds, [61, 57]);
  });

  it('drops unresolved ids only when standings are complete', () => {
    const result = resolveYourClubs([5, 57, 999], sections, true);
    assert.deepEqual(result.savedIds, [57]);
    assert.deepEqual(result.unresolvedIds, []);
    assert.equal(result.unavailable, false);
  });

  it('keeps unresolved ids in their order after resolved clubs during an outage', () => {
    const result = resolveYourClubs([5, 61, 999, 57], sections, false);
    assert.deepEqual(result.savedIds, [61, 57, 5, 999]);
    assert.deepEqual(result.unresolvedIds, [5, 999]);
    assert.equal(result.unavailable, false);
  });

  it('distinguishes clubs that cannot be shown from no clubs', () => {
    const result = resolveYourClubs([5], [], false);
    assert.deepEqual(result.clubs, []);
    assert.deepEqual(result.savedIds, [5]);
    assert.equal(result.unavailable, true);
  });

  it('resolves an empty list even during an outage', () => {
    assert.deepEqual(resolveYourClubs([], [], false), {
      clubs: [],
      savedIds: [],
      unresolvedIds: [],
      unavailable: false,
    });
  });
});
