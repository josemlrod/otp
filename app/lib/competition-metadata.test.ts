import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { getCompetitionMetadata } from './competition-metadata.ts';

describe('competition metadata', () => {
  const expected = [
    ['PL', '#3D0A49', '#00FF85', 'PL', 38],
    ['PD', '#E8412C', '#FFE9A8', 'LL', 38],
    ['SA', '#08327D', '#5FD8FF', 'SA', 38],
    ['BL1', '#C8061A', '#FFFFFF', 'BL', 34],
    ['CL', '#0A1B57', '#8FD6FF', '★', 8],
  ] as const;

  for (const [code, color, accent, mark, rounds] of expected) {
    it(`returns prototype metadata for ${code}`, () => {
      assert.deepEqual(getCompetitionMetadata(code), {
        color,
        accent,
        mark,
        rounds,
      });
    });
  }

  it('uses neutral colors and no round count for an unknown code', () => {
    assert.deepEqual(getCompetitionMetadata('UNKNOWN'), {
      color: '#30343B',
      accent: '#FFFFFF',
      mark: 'UNKNOWN',
    });
    assert.equal(getCompetitionMetadata('UNKNOWN').rounds, undefined);
  });

  it('does not treat inherited object properties as competition codes', () => {
    for (const code of ['constructor', 'toString', '__proto__']) {
      assert.deepEqual(getCompetitionMetadata(code), {
        color: '#30343B',
        accent: '#FFFFFF',
        mark: code,
      });
    }
  });
});
