import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';
import { areaPath } from './curve.ts';

const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe('area path', () => {
  it('is empty with fewer than two points', () => {
    assert.equal(areaPath([{ x: 0, y: 10 }], 50), '');
  });

  it('closes along the baseline and passes through every point', () => {
    const d = areaPath([{ x: 0, y: 50 }, { x: 10, y: 20 }, { x: 20, y: 70 }], 50);
    assert.match(d, /^M0 50L0 50C/);
    assert.match(d, /L20 50Z$/);
    assert.ok(d.includes(' 10 20C'), 'the curve reaches the peak');
  });

  it('never overshoots a peak or a trough', () => {
    const points = [{ x: 0, y: 50 }, { x: 1, y: 10 }, { x: 2, y: 12 }, { x: 3, y: 90 }, { x: 4, y: 50 }];
    const ys = numbers(areaPath(points, 50)).filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...ys) >= 10 && Math.max(...ys) <= 90, `control points stay in range: ${ys.join(',')}`);
  });
});
