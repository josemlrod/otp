import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { isFresh, MAX_AGE_MS } from './freshness.ts';

describe('freshness', () => {
  it('uses a one-hour max age', () => {
    assert.equal(MAX_AGE_MS, 3_600_000);
  });

  it('keeps data fresh until the millisecond before one hour', () => {
    assert.equal(isFresh(123, 123), true);
    assert.equal(isFresh(123, 123 + MAX_AGE_MS - 1), true);
  });

  it('marks data stale at one hour and afterwards', () => {
    assert.equal(isFresh(123, 123 + MAX_AGE_MS), false);
    assert.equal(isFresh(123, 123 + MAX_AGE_MS + 1), false);
  });
});
