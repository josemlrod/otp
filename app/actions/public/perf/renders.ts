// Per-component render counts for the perf HUD (./hud.ts). Counting stays off
// until the HUD switches it on, so normally (and always on the server) a
// render pays for a single boolean check.
type RenderStats = { enabled: boolean; counts: Map<string, number> };

// Lives on globalThis so the lazily loaded HUD and HMR-reloaded component
// modules all share one set of counts.
const scope = globalThis as typeof globalThis & { __otpRenderStats?: RenderStats };
export const renderStats: RenderStats = (scope.__otpRenderStats ??= {
  enabled: false,
  counts: new Map(),
});

// Call at the top of a component's render function.
export function countRender(name: string) {
  if (!renderStats.enabled) return;
  renderStats.counts.set(name, (renderStats.counts.get(name) ?? 0) + 1);
}
