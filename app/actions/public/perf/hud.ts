import { renderStats } from './renders.ts';

// A floating dev overlay for watching how the app performs while you use it.
// It's plain DOM inside a shadow root, outside the Remix tree, so its own
// updates never show up in the render or DOM-mutation counts it reports.

// How often the readout refreshes. Rates (renders/s, mutations/s) are per
// second, measured over this window.
const SAMPLE_MS = 500;
// Frames kept for the graph and the frame-time percentiles.
const FRAME_HISTORY = 120;
// The graph's vertical scale, in ms; slower frames are clipped to the top.
const GRAPH_MAX_MS = 50;
const COMPACT_KEY = 'otp:perf-compact';

type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTiming = PerformanceEntry & { interactionId?: number };
type LongAnimationFrame = PerformanceEntry & { blockingDuration: number };
type MemoryInfo = { usedJSHeapSize: number; totalJSHeapSize: number };

export function mountPerfHud({ onClose }: { onClose: () => void }): () => void {
  const cleanups: Array<() => void> = [];

  // Frames: the time between consecutive animation frames. The display's
  // refresh interval is taken as the median, so a frame that takes over 1.5x
  // that missed at least one vsync.
  const frameTimes = new Float32Array(FRAME_HISTORY);
  let frameCount = 0;
  let framesInWindow = 0;
  let droppedFrames = 0;
  let worstFrame = 0;
  let refreshInterval = 1000 / 60;
  let lastFrameAt = performance.now();
  let raf = requestAnimationFrame(function tick(now) {
    const delta = now - lastFrameAt;
    lastFrameAt = now;
    // Hidden tabs pause rAF; don't count the gap as one huge frame.
    if (delta < 1000) {
      frameTimes[frameCount % FRAME_HISTORY] = delta;
      frameCount++;
      framesInWindow++;
      worstFrame = Math.max(worstFrame, delta);
      if (delta > refreshInterval * 1.5) {
        droppedFrames += Math.round(delta / refreshInterval) - 1;
      }
    }
    raf = requestAnimationFrame(tick);
  });
  cleanups.push(() => cancelAnimationFrame(raf));

  // Main-thread work: long animation frames (Chromium) or long tasks, i.e.
  // anything over 50ms that blocks input and rendering.
  let longCount = 0;
  let longWorst = 0;
  let blockingTime = 0;
  const longSupported =
    observe('long-animation-frame', (entries) => {
      for (const entry of entries as LongAnimationFrame[]) {
        longCount++;
        longWorst = Math.max(longWorst, entry.duration);
        blockingTime += entry.blockingDuration;
      }
    }) ||
    observe('longtask', (entries) => {
      for (const entry of entries) {
        longCount++;
        longWorst = Math.max(longWorst, entry.duration);
        blockingTime += Math.max(0, entry.duration - 50);
      }
    });

  // Interaction latency: from a tap/key to the next paint, as INP measures it.
  let lastInput: number | null = null;
  let worstInput = 0;
  const inputSupported = observe(
    'event',
    (entries) => {
      for (const entry of entries as EventTiming[]) {
        if (!entry.interactionId) continue;
        lastInput = entry.duration;
        worstInput = Math.max(worstInput, entry.duration);
      }
    },
    { durationThreshold: 16 } as PerformanceObserverInit,
  );

  // Load milestones, buffered so they're there even if the HUD opens later.
  let lcp: number | null = null;
  let cls = 0;
  observe(
    'largest-contentful-paint',
    (entries) => {
      lcp = entries.at(-1)?.startTime ?? lcp;
    },
    { buffered: true },
  );
  const clsSupported = observe(
    'layout-shift',
    (entries) => {
      for (const entry of entries as LayoutShift[]) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    },
    { buffered: true },
  );

  // DOM writes the app makes, counted as mutation records.
  let mutations = 0;
  let mutationsInWindow = 0;
  const mutationObserver = new MutationObserver((records) => {
    mutations += records.length;
    mutationsInWindow += records.length;
  });
  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  cleanups.push(() => mutationObserver.disconnect());

  renderStats.enabled = true;
  cleanups.push(() => {
    renderStats.enabled = false;
  });
  let previousCounts = new Map(renderStats.counts);
  let peakHeap = 0;

  function reset() {
    renderStats.counts.clear();
    previousCounts = new Map();
    droppedFrames = 0;
    worstFrame = 0;
    longCount = 0;
    longWorst = 0;
    blockingTime = 0;
    lastInput = null;
    worstInput = 0;
    mutations = 0;
    peakHeap = 0;
    sample();
  }

  // --- View ---

  const host = document.createElement('otp-perf-hud');
  // Appended to <html> rather than <body> so it stays clear of the DOM the
  // Remix runtime owns and reconciles.
  document.documentElement.append(host);
  cleanups.push(() => host.remove());
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${HUD_STYLES}</style>
    <section part="hud">
      <button type="button" class="header" data-action="compact" title="Collapse or expand">
        <span class="fps"></span>
        <canvas width="${FRAME_HISTORY}" height="28"></canvas>
      </button>
      <div class="details"></div>
      <div class="actions">
        <button type="button" data-action="reset">reset</button>
        <button type="button" data-action="close">hide ⌥⇧P</button>
      </div>
    </section>
  `;
  const panel = root.querySelector('section')!;
  const fpsLabel = root.querySelector<HTMLElement>('.fps')!;
  const details = root.querySelector<HTMLElement>('.details')!;
  const canvas = root.querySelector('canvas')!;
  const context = canvas.getContext('2d')!;

  let compact = readCompact();
  panel.classList.toggle('compact', compact);

  root.addEventListener('click', (event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-action]')
      ?.dataset.action;
    if (action === 'compact') {
      compact = !compact;
      panel.classList.toggle('compact', compact);
      writeCompact(compact);
    } else if (action === 'reset') {
      reset();
    } else if (action === 'close') {
      onClose();
    }
  });

  let windowStart = performance.now();
  function sample() {
    const now = performance.now();
    const seconds = (now - windowStart) / 1000;
    windowStart = now;

    const recent = Array.from(
      frameTimes.subarray(0, Math.min(frameCount, FRAME_HISTORY)),
    ).sort((a, b) => a - b);
    if (recent.length >= 10) {
      refreshInterval = percentile(recent, 0.5);
    }
    const fps = Math.round(framesInWindow / seconds);
    const hz = Math.round(1000 / refreshInterval);
    framesInWindow = 0;

    fpsLabel.textContent = `${fps} fps`;
    fpsLabel.dataset.level =
      fps >= hz * 0.9 ? 'good' : fps >= hz * 0.6 ? 'warn' : 'bad';
    drawGraph();
    if (compact) {
      mutationsInWindow = 0;
      return;
    }

    let totalRenders = 0;
    let rendersInWindow = 0;
    const rows = Array.from(renderStats.counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => {
        const delta = count - (previousCounts.get(name) ?? 0);
        totalRenders += count;
        rendersInWindow += delta;
        return row(name, `${count}`, delta ? `+${delta}` : '', 'sub');
      });
    previousCounts = new Map(renderStats.counts);

    const memory = (performance as Performance & { memory?: MemoryInfo }).memory;
    if (memory) peakHeap = Math.max(peakHeap, memory.usedJSHeapSize);

    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const hydrated = performance.getEntriesByName('otp:hydrated')[0]?.startTime;

    details.innerHTML = [
      section('frames'),
      row('refresh', `${hz} Hz`),
      row('p95 / worst', `${ms(percentile(recent, 0.95))} / ${ms(worstFrame)}`),
      row('dropped', `${droppedFrames}`),
      section('main thread'),
      longSupported
        ? row('long frames', `${longCount}`, longCount ? `worst ${ms(longWorst)}` : '')
        : row('long frames', 'n/a'),
      longSupported ? row('blocking', ms(blockingTime)) : '',
      inputSupported
        ? row('input latency', lastInput === null ? '–' : ms(lastInput), worstInput ? `worst ${ms(worstInput)}` : '')
        : row('input latency', 'n/a'),
      section('renders'),
      row('total', `${totalRenders}`, `${Math.round(rendersInWindow / seconds)}/s`),
      ...rows,
      section('dom'),
      row('nodes', `${document.getElementsByTagName('*').length}`),
      row('mutations', `${mutations}`, `${Math.round(mutationsInWindow / seconds)}/s`),
      section('memory'),
      memory
        ? row('js heap', mb(memory.usedJSHeapSize), `peak ${mb(peakHeap)}`)
        : row('js heap', 'n/a'),
      section('load'),
      row('ttfb', nav ? ms(nav.responseStart) : '–'),
      row('fcp / lcp', `${fcp ? ms(fcp) : '–'} / ${lcp ? ms(lcp) : '–'}`),
      row('hydrated', hydrated ? ms(hydrated) : '–'),
      row('cls', clsSupported ? cls.toFixed(3) : 'n/a'),
    ].join('');
    mutationsInWindow = 0;
  }

  // One bar per frame, oldest on the left. Bars over the refresh interval
  // turn amber; ones that took three or more vsyncs turn red.
  function drawGraph() {
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const count = Math.min(frameCount, FRAME_HISTORY);
    for (let i = 0; i < count; i++) {
      const delta = frameTimes[(frameCount - count + i) % FRAME_HISTORY];
      const barHeight = Math.max(1, (Math.min(delta, GRAPH_MAX_MS) / GRAPH_MAX_MS) * height);
      context.fillStyle =
        delta <= refreshInterval * 1.5
          ? '#1fb85a'
          : delta < refreshInterval * 3
            ? '#f5a524'
            : '#e5484d';
      context.fillRect(width - count + i, height - barHeight, 1, barHeight);
    }
    const target = height - (refreshInterval / GRAPH_MAX_MS) * height;
    context.fillStyle = 'rgba(255, 255, 255, 0.35)';
    context.fillRect(0, Math.round(target), width, 1);
  }

  sample();
  const interval = setInterval(sample, SAMPLE_MS);
  cleanups.push(() => clearInterval(interval));

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };

  function observe(
    type: string,
    callback: (entries: PerformanceEntryList) => void,
    options: PerformanceObserverInit = {},
  ): boolean {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return false;
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ type, ...options });
    cleanups.push(() => observer.disconnect());
    return true;
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function ms(value: number): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}ms`;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function section(title: string): string {
  return `<h4>${title}</h4>`;
}

// Values are numbers and names of our own components, so no escaping needed.
function row(label: string, value: string, note = '', kind = ''): string {
  return `<div class="row ${kind}"><span>${label}</span><b>${value}</b><i>${note}</i></div>`;
}

function readCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCompact(compact: boolean) {
  try {
    if (compact) localStorage.setItem(COMPACT_KEY, '1');
    else localStorage.removeItem(COMPACT_KEY);
  } catch {}
}

const HUD_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 6px);
    right: calc(env(safe-area-inset-right, 0px) + 6px);
    z-index: 2147483647;
  }
  * { box-sizing: border-box; }
  section {
    width: 214px;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 12px);
    overflow-y: auto;
    padding: 6px 8px 8px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.82);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.15), 0 8px 24px rgba(0, 0, 0, 0.4);
    color: #f3f4f5;
    font: 10.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    -webkit-user-select: none;
    user-select: none;
  }
  section.compact { width: auto; }
  section.compact .details, section.compact .actions { display: none; }
  button {
    font: inherit;
    color: inherit;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .fps { min-width: 46px; text-align: left; font-weight: 700; font-size: 12px; }
  .fps[data-level='good'] { color: #1fb85a; }
  .fps[data-level='warn'] { color: #f5a524; }
  .fps[data-level='bad'] { color: #e5484d; }
  canvas { width: 120px; height: 28px; flex: none; image-rendering: pixelated; }
  h4 {
    margin: 6px 0 1px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(235, 235, 245, 0.45);
  }
  .row { display: flex; gap: 6px; white-space: nowrap; }
  .row span { flex: 1; overflow: hidden; text-overflow: ellipsis; color: rgba(235, 235, 245, 0.7); }
  .row.sub span { padding-left: 8px; }
  .row b { font-weight: 600; }
  .row i { min-width: 40px; text-align: right; font-style: normal; color: rgba(235, 235, 245, 0.45); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
  .actions button {
    flex: 1;
    padding: 4px 0;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
  }
`;
