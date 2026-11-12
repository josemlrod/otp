import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { choosePlan, type Plan } from './flow.ts';

const plans: Plan[] = [
  { min: 0, cols: [['a', 'b', 'c']] },
  { min: 500, cols: [['a'], ['b', 'c']] },
  { min: 760, cols: [['a'], ['b'], ['c']] },
];

describe('column plans', () => {
  it('picks by exact width the first time', () => {
    assert.equal(choosePlan(320, plans, -1), 0);
    assert.equal(choosePlan(500, plans, -1), 1);
    assert.equal(choosePlan(759, plans, -1), 1);
    assert.equal(choosePlan(900, plans, -1), 2);
  });

  it('steps up only once clearly past a threshold', () => {
    assert.equal(choosePlan(510, plans, 0), 0);
    assert.equal(choosePlan(516, plans, 0), 1);
    assert.equal(choosePlan(780, plans, 1), 2);
    assert.equal(choosePlan(900, plans, 0), 2);
  });

  it('steps down only once clearly below a threshold', () => {
    assert.equal(choosePlan(490, plans, 1), 1);
    assert.equal(choosePlan(483, plans, 1), 0);
    assert.equal(choosePlan(750, plans, 2), 2);
    assert.equal(choosePlan(300, plans, 2), 0);
  });
});
