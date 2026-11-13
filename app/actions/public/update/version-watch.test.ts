import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { VersionWatch } from './version-watch.ts';

function setup(answers: (string | null)[], options: { minGap?: number } = {}) {
  let time = 0;
  let calls = 0;
  const watch = new VersionWatch({
    current: 'a',
    fetchVersion: async () => answers[Math.min(calls++, answers.length - 1)] ?? null,
    minGap: options.minGap ?? 0,
    now: () => time,
  });
  let updates = 0;
  watch.addEventListener('update', () => updates++);
  return {
    watch,
    calls: () => calls,
    updates: () => updates,
    advance: (ms: number) => (time += ms),
  };
}

describe('VersionWatch', () => {
  it('stays quiet while the server runs the same deploy', async () => {
    const { watch, updates } = setup(['a']);
    assert.equal(await watch.check(), false);
    assert.equal(watch.updateAvailable, false);
    assert.equal(updates(), 0);
  });

  it('announces a newer deploy', async () => {
    const { watch, updates } = setup(['a', 'b']);
    await watch.check();
    assert.equal(await watch.check(), true);
    assert.equal(watch.latest, 'b');
    assert.equal(updates(), 1);
  });

  it('announces again on later checks, so a dismissed prompt can come back', async () => {
    const { watch, updates } = setup(['b']);
    await watch.check();
    await watch.check();
    assert.equal(updates(), 2);
  });

  it('keeps what it knew when a check fails offline', async () => {
    const { watch } = setup(['b', null]);
    await watch.check();
    assert.equal(await watch.check(), true);
    assert.equal(watch.latest, 'b');
  });

  it('shares one request between overlapping checks', async () => {
    const { watch, calls } = setup(['b']);
    await Promise.all([watch.check(), watch.check(), watch.check()]);
    assert.equal(calls(), 1);
  });

  it('skips checks that come too soon after the last one', async () => {
    const { watch, calls, advance } = setup(['a'], { minGap: 10_000 });
    await watch.check();
    advance(5_000);
    await watch.check();
    assert.equal(calls(), 1);
    advance(5_000);
    await watch.check();
    assert.equal(calls(), 2);
  });
});
