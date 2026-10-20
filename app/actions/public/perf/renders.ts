type RenderStats = { enabled: boolean; counts: Map<string, number> };

export const HYDRATED_MARK = 'otp:hydrated';

const sharedAcrossHmrReloads = globalThis as typeof globalThis & {
  __otpRenderStats?: RenderStats;
};
export const renderStats: RenderStats = (sharedAcrossHmrReloads.__otpRenderStats ??= {
  enabled: false,
  counts: new Map(),
});

export function countRender(name: string) {
  if (!renderStats.enabled) return;
  renderStats.counts.set(name, (renderStats.counts.get(name) ?? 0) + 1);
}
