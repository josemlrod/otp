import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { countdown, ordinal, soon } from './match-format.ts';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const later = (ms: number) => new Date(NOW + ms);
const HOUR = 3_600_000;

describe('match format', () => {
  it('counts down in days and hours, or hours and minutes on the day', () => {
    assert.deepEqual(countdown(later(2 * 24 * HOUR + 4 * HOUR), NOW), [[2, 'd'], [4, 'h']]);
    assert.deepEqual(countdown(later(5 * HOUR + 30 * 60_000), NOW), [[5, 'h'], [30, 'm']]);
    assert.deepEqual(countdown(later(-HOUR), NOW), [[0, 'h'], [0, 'm']]);
  });

  it('leads a row with days, or hours on the day', () => {
    assert.equal(soon(later(3 * 24 * HOUR + HOUR), NOW), '3d');
    assert.equal(soon(later(20 * HOUR), NOW), '20h');
  });

  it('writes league positions as ordinals', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), [
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ]);
  });
});
