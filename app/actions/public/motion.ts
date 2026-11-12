// Hand-rolled springs for gesture-driven motion. Remix has no motion library, and CSS transitions
// can't be seeded with a finger's velocity or caught mid-flight.

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type TimeState = { scale: number; anchorReal: number; anchorVirtual: number };
const sharedAcrossHmr = globalThis as typeof globalThis & { __otpMotionTime?: TimeState };
const time: TimeState = (sharedAcrossHmr.__otpMotionTime ??= { scale: 1, anchorReal: 0, anchorVirtual: 0 });

/**
 * Animation time in ms. Same as performance.now() unless the motion lab slowed or paused it.
 * Pointer input, velocity and press delays stay in real time; only what animates is scaled.
 */
export const motionTime = {
  now(real = performance.now()) {
    return time.anchorVirtual + (real - time.anchorReal) * time.scale;
  },
  get scale() {
    return time.scale;
  },
  /** 1 is real time, 0.25 is quarter speed, 0 pauses. */
  setScale(scale: number) {
    const real = performance.now();
    time.anchorVirtual = motionTime.now(real);
    time.anchorReal = real;
    time.scale = scale;
  },
  /** Moves animation time forward without real time passing (one 60 Hz frame by default). */
  step(ms = 1000 / 60) {
    time.anchorVirtual += ms;
  },
  /** setTimeout in animation time. Returns a cancel function. */
  after(ms: number, callback: () => void): () => void {
    if (time.scale === 1) {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    }
    const due = motionTime.now() + ms;
    let frame = requestAnimationFrame(function wait(now) {
      if (motionTime.now(now) >= due) return callback();
      frame = requestAnimationFrame(wait);
    });
    return () => cancelAnimationFrame(frame);
  },
};

export const prefersReducedMotion = reduced;

// iOS-style resistance past an edge: moves less the further you pull.
export function rubber(overshoot: number, dimension: number, constant = 0.55) {
  const distance = Math.abs(overshoot);
  return Math.sign(overshoot) * (1 - 1 / ((distance * constant) / dimension + 1)) * dimension;
}

export type Spring = { stiffness: number; damping: number };

// Damping ratio in the comments; 1 means no overshoot.
export const SPRING = {
  release: { stiffness: 420, damping: 33 }, // ≈0.8, the end of a drag lands with a little give
  snap: { stiffness: 760, damping: 55 }, // ≈1.0, fast return when a gesture falls short
  settle: { stiffness: 400, damping: 40 }, // 1.0, tap or button driven, no force applied
} satisfies Record<string, Spring>;
const REDUCED_SPRING: Spring = { stiffness: 900, damping: 60 };

type ToOptions = { velocity?: number; spring?: Spring; precision?: number };

// A number driven either directly (track phase) or by a spring (release phase).
// Retargeting mid-flight keeps the current velocity, so every motion can be caught.
export class Value {
  value: number;
  velocity = 0;
  target: number;
  #onChange: (value: number) => void;
  #frame = 0;
  #resolve: ((settled: boolean) => void) | null = null;

  constructor(value: number, onChange: (value: number) => void) {
    this.value = value;
    this.target = value;
    this.#onChange = onChange;
    onChange(value);
  }

  get animating() {
    return this.#frame !== 0;
  }

  set(value: number) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.#onChange(value);
  }

  stop() {
    if (!this.#frame) return;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(false);
  }

  to(target: number, { velocity = this.velocity, spring = SPRING.settle, precision = 0.25 }: ToOptions = {}) {
    const carried = velocity;
    this.stop();
    const calm = reduced();
    const { stiffness, damping } = calm ? REDUCED_SPRING : spring;
    this.velocity = calm ? 0 : carried;
    this.target = target;

    return new Promise<boolean>((resolve) => {
      this.#resolve = resolve;
      let last = motionTime.now();
      const step = (now: number) => {
        const at = motionTime.now(now);
        const elapsed = Math.min(0.05, (at - last) / 1000);
        last = at;
        const steps = Math.max(1, Math.ceil(elapsed / 0.004));
        const h = elapsed / steps;
        for (let i = 0; i < steps; i++) {
          const acceleration = -stiffness * (this.value - target) - damping * this.velocity;
          this.velocity += acceleration * h;
          this.value += this.velocity * h;
        }
        if (Math.abs(this.velocity) < precision * 10 && Math.abs(this.value - target) < precision) {
          this.value = target;
          this.velocity = 0;
          this.#frame = 0;
          this.#resolve = null;
          this.#onChange(target);
          resolve(true);
          return;
        }
        this.#onChange(this.value);
        this.#frame = requestAnimationFrame(step);
      };
      this.#frame = requestAnimationFrame(step);
    });
  }
}

type Sample = { x: number; y: number; t: number };

// Release velocity in px/s from the last ~80ms of pointer samples.
export function tracker() {
  let samples: Sample[] = [];
  return {
    reset(x: number, y: number, t: number) {
      samples = [{ x, y, t }];
    },
    add(x: number, y: number, t: number) {
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[0]!.t > 80) samples.shift();
    },
    velocity(now: number) {
      if (samples.length < 2) return { x: 0, y: 0 };
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      if (now - last.t > 60) return { x: 0, y: 0 };
      const dt = (last.t - first.t) / 1000;
      return dt > 0 ? { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt } : { x: 0, y: 0 };
    },
  };
}

export type Tracker = ReturnType<typeof tracker>;

// Stops the page from scrolling while a gesture owns the touch.
export function blockScrollWhile(target: HTMLElement, isClaimed: () => boolean, signal: AbortSignal) {
  target.addEventListener(
    'touchmove',
    (event) => {
      if (isClaimed()) event.preventDefault();
    },
    { passive: false, signal },
  );
}
