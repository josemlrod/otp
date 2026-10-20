import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { getCompetitionMetadata } from './competition-metadata.ts';

describe('competition metadata', () => {
  it('falls back to neutral colors marked with the code for unknown competitions', () => {
    for (const code of ['UNKNOWN', 'constructor']) {
      assert.deepEqual(getCompetitionMetadata(code), {
        color: 'oklch(32.4% 0.014 261.7)',
        accent: 'oklch(100% 0 0)',
        mark: code,
      });
    }
  });
});
