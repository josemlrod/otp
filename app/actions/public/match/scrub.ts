import { blockScrollWhile, clamp, SPRING, tracker, type Value } from '../motion.ts';

type Options = {
  end: number;
  playhead: Value;
  /** The goal or card a loose scrub should settle on, if one is close. */
  snap: (t: number) => number | null;
  onScrub: () => void;
};

// Drag along a replay strip to move the playhead; tap to jump to a minute. A finger only claims
// the gesture once it's clearly moving sideways, so a vertical swipe still scrolls the sheet.
// On release the playhead settles on a nearby goal or card, carrying the finger's speed.
export function wireScrub(chart: HTMLElement, signal: AbortSignal, options: Options) {
  const { end, playhead, snap, onScrub } = options;
  const velocity = tracker();
  let drag: { id: number; x0: number; y0: number; claimed: boolean } | null = null;

  const tAt = (clientX: number) => {
    const rect = chart.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * end, 0, end);
  };
  const settle = (t: number) => snap(t) ?? (t >= end - 1.5 ? end : t);
  const go = (t: number, speed = 0) => {
    onScrub();
    void playhead.to(clamp(t, 0, end), { velocity: speed, spring: SPRING.settle, precision: 0.02 });
  };

  const claim = (event: PointerEvent) => {
    if (!drag) return;
    drag.claimed = true;
    try {
      chart.setPointerCapture(event.pointerId);
    } catch {}
    chart.setAttribute('data-scrubbing', '');
    onScrub();
    playhead.set(tAt(event.clientX));
  };

  chart.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, claimed: false };
    velocity.reset(event.clientX, 0, event.timeStamp);
    if (event.pointerType === 'mouse') claim(event);
  }, { signal });

  chart.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.claimed) {
      const dx = Math.abs(event.clientX - drag.x0);
      const dy = Math.abs(event.clientY - drag.y0);
      if (dy > 8 && dy > dx) {
        drag = null;
        return;
      }
      if (dx < 6) return;
      claim(event);
    }
    velocity.add(event.clientX, 0, event.timeStamp);
    playhead.set(tAt(event.clientX));
  }, { signal });

  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { claimed } = drag;
    drag = null;
    chart.removeAttribute('data-scrubbing');
    if (!claimed) {
      if (event.type === 'pointerup') go(settle(tAt(event.clientX)));
      return;
    }
    const target = settle(playhead.value);
    if (target !== playhead.value) {
      go(target, (velocity.velocity(event.timeStamp).x / (chart.clientWidth || 1)) * end);
    }
  };
  chart.addEventListener('pointerup', release, { signal });
  chart.addEventListener('pointercancel', release, { signal });

  chart.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 5 : 1;
    const from = Math.round(playhead.target);
    if (event.key === 'ArrowLeft') go(from - step);
    else if (event.key === 'ArrowRight') go(from + step);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(end);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }, { signal });

  blockScrollWhile(chart, () => !!drag?.claimed, signal);
}
