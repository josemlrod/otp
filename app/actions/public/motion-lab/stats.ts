import type { Sample } from './trace.ts';

export type Channel = 'x' | 'y' | 'w' | 'h' | 'tx' | 'ty' | 'sx' | 'sy' | 'opacity' | 'radius';
export const CHANNELS: Channel[] = ['y', 'x', 'ty', 'tx', 'sx', 'opacity', 'w', 'h', 'radius'];

export function velocities(samples: Sample[], channel: Channel): number[] {
  return samples.map((sample, i) => {
    const previous = samples[i - 1];
    const dt = previous ? sample.t - previous.t : 0;
    return dt > 0 ? (sample[channel] - previous![channel]) * 1000 / dt : 0;
  });
}

export type Summary = {
  durationMs: number;
  frames: number;
  peakVelocity: number;
  overshoot: number;
  firstFrameJump: number;
  maxFrameDelta: number;
};

export function summarize(samples: Sample[], channel: Channel): Summary {
  const deltas = samples.map((sample, i) => i ? Math.abs(sample[channel] - samples[i - 1]![channel]) : 0);
  const epsilon = channel === 'sx' || channel === 'sy' || channel === 'opacity' ? 0.00001 : 0.01;
  const first = deltas.findIndex((delta) => delta >= epsilon);
  const last = deltas.findLastIndex((delta) => delta >= epsilon);
  if (first < 0) {
    return { durationMs: 0, frames: 0, peakVelocity: 0, overshoot: 0, firstFrameJump: 0, maxFrameDelta: 0 };
  }
  const final = samples.at(-1)![channel];
  // Start at the furthest excursion from rest. This excludes the outward pull
  // in a there-and-back gesture and keeps the subsequent settling oscillations.
  let approach = 0;
  for (let i = 1; i < samples.length; i++) {
    if (Math.abs(samples[i]![channel] - final) > Math.abs(samples[approach]![channel] - final)) {
      approach = i;
    }
  }
  const direction = Math.sign(final - samples[approach]![channel]);
  const crossing = samples.findIndex((sample, i) =>
    i > approach && (sample[channel] - final) * direction >= 0,
  );
  const overshoot = crossing < 0 ? 0 : Math.max(
    0, ...samples.slice(crossing).map((sample) => (sample[channel] - final) * direction),
  );
  return {
    durationMs: samples[last]!.t - samples[first - 1]!.t,
    frames: last - first + 1,
    peakVelocity: Math.max(...velocities(samples, channel).map(Math.abs)),
    overshoot,
    firstFrameJump: deltas[first]!,
    maxFrameDelta: Math.max(...deltas),
  };
}

export function dominantChannel(samples: Sample[]): Channel {
  return CHANNELS.reduce(
    (best, channel) => range(samples, channel) > range(samples, best) ? channel : best,
    CHANNELS[0]!,
  );
}

export function range(samples: Sample[], channel: Channel) {
  if (!samples.length) return 0;
  return Math.max(...samples.map((s) => s[channel])) - Math.min(...samples.map((s) => s[channel]));
}
