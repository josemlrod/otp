import * as assert from 'remix/assert';
import { it } from 'remix/test';
import { motionTime, Value } from '../motion.ts';
import { installRateControl } from './rate.ts';
import { record } from './trace.ts';
import { summarize } from './stats.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise(requestAnimationFrame);

it('animation time runs at the chosen scale', async (t) => {
  t.after(() => motionTime.setScale(1));
  motionTime.setScale(0.5);
  const start = motionTime.now();
  await wait(100);
  const elapsed = motionTime.now() - start;
  assert.ok(elapsed >= 35 && elapsed <= 65);
  motionTime.setScale(0);
  const paused = motionTime.now();
  await wait(50);
  assert.equal(motionTime.now(), paused);
  motionTime.step();
  assert.ok(Math.abs(motionTime.now() - paused - 1000 / 60) < 0.01);
});
it('a paused spring holds still and steps one frame at a time', async (t) => {
  t.after(() => motionTime.setScale(1));
  const value = new Value(0, () => {});
  t.after(() => value.stop());
  motionTime.setScale(0);
  void value.to(100);
  await frame();
  await frame();
  await frame();
  assert.equal(value.value, 0);
  motionTime.step();
  await frame();
  assert.ok(value.value > 0);
});
it("WAAPI animations start at the lab's rate", async (t) => {
  t.after(() => motionTime.setScale(1));
  const uninstall = installRateControl();
  t.after(uninstall);
  const el = document.createElement('div');
  document.body.append(el);
  t.after(() => el.remove());
  motionTime.setScale(0.25);
  const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], 200);
  t.after(() => animation.cancel());
  await animation.ready;
  assert.equal(animation.playbackRate, 0.25);
  uninstall();
  await animation.ready;
  assert.equal(animation.playbackRate, 1);
});
it('the recorder samples every frame and summarises the motion', async (t) => {
  motionTime.setScale(1);
  t.after(() => motionTime.setScale(1));
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;width:20px;height:20px';
  document.body.append(el);
  t.after(() => el.remove());
  const recording = record({ box: el });
  // Preserve the initial frame so first-frame jump has a baseline.
  await frame();
  const animation = el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }],
    { duration: 200, fill: 'forwards' },
  );
  t.after(() => animation.cancel());
  const trace = await recording.done;
  const samples = trace.targets.box!;
  assert.ok(samples.length >= 8);
  assert.ok(Math.abs(samples.at(-1)!.tx - 100) <= 0.5);
  const stats = summarize(samples, 'tx');
  assert.equal(stats.overshoot, 0);
  assert.ok(stats.firstFrameJump < 20);
});

it('the recorder stops sampling a target removed during motion', async (t) => {
  motionTime.setScale(1);
  t.after(() => motionTime.setScale(1));
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;width:20px;height:20px';
  document.body.append(el);
  t.after(() => el.remove());
  const recording = record({ box: el });
  await frame();
  const animation = el.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(100px)' }],
    { duration: 400, fill: 'forwards' },
  );
  t.after(() => animation.cancel());
  await wait(100);
  const removedAt = performance.now();
  el.remove();
  const trace = await recording.done;
  const samples = trace.targets.box!;
  assert.ok(samples.length >= 3);
  assert.ok(samples.every((sample) => sample.real <= removedAt));
  assert.ok(samples.every((sample) => sample.w > 0 && sample.h > 0));
  assert.ok(samples.at(-1)!.ty > 0 && samples.at(-1)!.ty < 100);
});
