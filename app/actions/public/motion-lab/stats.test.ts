import * as assert from 'remix/assert';
import { it } from 'remix/test';
import { summarize } from './stats.ts';
import type { Sample } from './trace.ts';

function samples(values: number[]): Sample[] {
  return values.map((y, i) => ({
    real: i * 16, t: i * 16, x: 0, y, w: 20, h: 20,
    tx: 0, ty: 0, sx: 1, sy: 1, opacity: 1, radius: 0,
  }));
}

it('monotonic easing has no overshoot', () => {
  assert.equal(summarize(samples([0, 30, 70, 90, 100, 100]), 'y').overshoot, 0);
});

it('spring overshoot measures only travel past rest', () => {
  assert.equal(summarize(samples([0, 60, 100, 105, 102, 100, 100]), 'y').overshoot, 5);
});

it('a pull returning to rest excludes the outward distance from overshoot', () => {
  assert.equal(summarize(samples([0, 60, 120, 80, 20, 0, -3, -1, 0, 0]), 'y').overshoot, 3);
});

it('scale summaries retain small per-frame changes', () => {
  const trace = samples([0, 0, 0, 0]).map((sample, i) => ({ ...sample, sx: 1 - i * 0.001 }));
  const summary = summarize(trace, 'sx');
  assert.equal(summary.frames, 3);
  assert.equal(summary.durationMs, 48);
});
