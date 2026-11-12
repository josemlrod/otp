import { motionTime } from '../motion.ts';

const STEP_MS = 1000 / 60;
const pausedByLab = new Set<Animation>();
let frame = 0;
let originalAnimate: typeof Element.prototype.animate | null = null;

function apply(animation: Animation) {
  const scale = motionTime.scale;
  if (scale === 0) {
    if (animation.playState === 'running') {
      animation.pause();
      pausedByLab.add(animation);
    }
    return;
  }
  if (pausedByLab.delete(animation)) animation.play();
  if (animation.playbackRate !== scale) animation.updatePlaybackRate(scale);
}

function sweep() {
  for (const animation of document.getAnimations()) apply(animation);
  frame = requestAnimationFrame(sweep);
}

/** Starts following motionTime.scale. Call once when the lab mounts; returns an uninstall. */
export function installRateControl() {
  originalAnimate = Element.prototype.animate;
  const original = originalAnimate;
  Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
    const animation = original.apply(this, args);
    apply(animation); // WAAPI starts slowed from its first frame
    return animation;
  };
  frame = requestAnimationFrame(sweep);
  return () => {
    cancelAnimationFrame(frame);
    if (originalAnimate) Element.prototype.animate = originalAnimate;
    for (const animation of document.getAnimations()) {
      if (pausedByLab.delete(animation)) animation.play();
      animation.updatePlaybackRate(1);
    }
  };
}

/** While paused, moves every paused animation forward one frame, in step with motionTime.step(). */
export function stepAnimations(ms = STEP_MS) {
  for (const animation of pausedByLab) {
    animation.currentTime = Number(animation.currentTime ?? 0) + ms;
  }
}
