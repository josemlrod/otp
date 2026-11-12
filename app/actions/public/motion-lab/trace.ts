import { motionTime } from '../motion.ts';

export type Sample = {
  real: number;
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  opacity: number;
  radius: number;
};
export type Trace = { scale: number; startedAt: string; targets: Record<string, Sample[]> };
const fields = ['x', 'y', 'w', 'h', 'tx', 'ty', 'sx', 'sy', 'opacity', 'radius'] as const;

export function changed(a: Sample, b: Sample) {
  return fields.some((key) => {
    const epsilon = key === 'sx' || key === 'sy' || key === 'opacity' ? 0.00001 : 0.01;
    return Math.abs(a[key] - b[key]) >= epsilon;
  });
}

/** Holds resolved targets while connected, even when their selector stops matching. */
export function record(
  targets: Record<string, string | Element>,
  { maxRealMs = 8000, stillFrames = 20 } = {},
): { done: Promise<Trace>; stop: () => Trace; readonly frames: number } {
  const trace: Trace = { scale: motionTime.scale, startedAt: new Date().toISOString(), targets: {} };
  const resolved = new Map<string, Element>();
  const detached = new Set<string>();
  const still = new Map<string, number>();
  for (const name of Object.keys(targets)) trace.targets[name] = [];
  let moved = false;
  let frame = 0;
  let finished = false;
  const start = performance.now();
  let resolve!: (trace: Trace) => void;
  const done = new Promise<Trace>((r) => {
    resolve = r;
  });

  function stop() {
    if (finished) return trace;
    finished = true;
    cancelAnimationFrame(frame);
    // Keep three frames of context at either end, using one shared animation-time origin.
    let origin = Infinity;
    for (const [name, samples] of Object.entries(trace.targets)) {
      const changes = samples
        .map((sample, i) => i > 0 && changed(samples[i - 1]!, sample) ? i : -1)
        .filter((i) => i >= 0);
      const first = changes[0];
      const last = changes.at(-1);
      const kept = first === undefined
        ? samples.slice(-3)
        : samples.slice(Math.max(0, first - 3), last! + 4);
      trace.targets[name] = kept;
      if (kept.length) origin = Math.min(origin, kept[0]!.t);
    }
    for (const samples of Object.values(trace.targets)) {
      for (const sample of samples) sample.t -= origin;
    }
    resolve(trace);
    return trace;
  }

  function tick(real: number) {
    for (const [name, target] of Object.entries(targets)) {
      let el = resolved.get(name);
      if (!el) {
        el = typeof target === 'string' ? document.querySelector(target) ?? undefined : target;
        if (!el) continue;
        resolved.set(name, el);
      }
      if (!el.isConnected || detached.has(name)) {
        detached.add(name);
        still.set(name, stillFrames);
        continue;
      }
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      const sample: Sample = {
        real,
        t: motionTime.now(real),
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
        tx: matrix.e,
        ty: matrix.f,
        sx: Math.hypot(matrix.a, matrix.b),
        sy: Math.hypot(matrix.c, matrix.d),
        opacity: parseFloat(style.opacity),
        radius: parseFloat(style.borderTopLeftRadius),
      };
      const samples = trace.targets[name]!;
      const previous = samples.at(-1);
      if (previous && changed(previous, sample)) {
        moved = true;
        still.set(name, 0);
      } else {
        still.set(name, (still.get(name) ?? 0) + 1);
      }
      samples.push(sample);
    }
    const settled = moved && [...resolved.keys()].every((name) => (still.get(name) ?? 0) >= stillFrames);
    if (real - start >= maxRealMs || settled) stop();
    else frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return {
    done,
    stop,
    get frames() {
      return Math.max(0, ...Object.values(trace.targets).map((samples) => samples.length));
    },
  };
}
