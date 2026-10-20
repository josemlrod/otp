import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { getCompetitionMetadata } from './competition-metadata.ts';

describe('competition metadata', () => {
  it('falls back to neutral colors marked with the code for unknown competitions', () => {
    for (const code of ['UNKNOWN', 'constructor']) {
      assert.deepEqual(getCompetitionMetadata(code), {
        color: '#30343B',
        accent: '#FFFFFF',
        mark: code,
      });
    }
  });
});
