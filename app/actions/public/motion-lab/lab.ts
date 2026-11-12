import { motionTime } from '../motion.ts';
import { installRateControl, stepAnimations } from './rate.ts';
import { record, type Trace } from './trace.ts';
import { CHANNELS, dominantChannel, range, summarize, velocities, type Channel } from './stats.ts';

export { record, summarize, stepAnimations };

/** Panel-less mounting keeps rate control and the scripting API available for captures. */
export function mountMotionLab(
  { onClose, panel = true }: { onClose: () => void; panel?: boolean },
): () => void {
  const uninstall = installRateControl();
  const host = document.createElement('otp-motion-lab');
  const root = host.attachShadow({ mode: 'open' });
  let picked: Element | null = null;
  let recording: ReturnType<typeof record> | null = null;
  let trace: Trace | null = null;
  let channel: Channel = 'y';
  let picking = false;
  let swallowClick = false;
  let previousScale = motionTime.scale || 1;
  let compact = false;
  try {
    compact = localStorage.getItem('otp:motion-compact') === '1';
  } catch {}
  if (panel) document.documentElement.append(host);
  root.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        left: calc(env(safe-area-inset-left, 0px) + 6px);
        bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
        z-index: 2147483647;
      }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      section {
        width: 268px;
        padding: 8px;
        border-radius: 10px;
        background: oklch(0% 0 0 / 0.82);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: var(--color-text, white);
        font: 10.5px/1.45 ui-monospace, monospace;
        max-height: calc(100dvh - 12px);
        overflow: auto;
      }
      button, input { font: inherit; color: inherit; }
      button { border: 0; background: oklch(100% 0 0 / 0.1); border-radius: 4px; padding: 4px; cursor: pointer; }
      button.active { background: oklch(100% 0 0 / 0.22); }
      button:disabled { opacity: .35; }
      .row { display: flex; align-items: center; gap: 3px; margin-top: 5px; }
      .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      canvas { display: block; margin-top: 6px; width: 252px; height: 110px; }
      input { width: 100%; }
      .outline { position: fixed; pointer-events: none; border: 1px solid oklch(91.1% 0.197 124.6); }
      .past { border-style: dashed; }
      .compact { width: auto; }
      .compact .details, .compact .speed { display: none; }
      .help { opacity: .65; margin-top: 6px; }
    </style>
    <section>
      <button data-action="compact" class="header">motion</button>
      <div class="row speed">
        <button data-scale="1">1×</button><button data-scale=".5">½×</button>
        <button data-scale=".25">¼×</button><button data-scale=".1">⅒×</button>
        <button data-action="pause">⏸</button><button data-action="step">⇥</button>
      </div>
      <div class="details">
        <div class="row">
          <button data-action="pick">pick</button><span class="label">no target</span>
          <button data-action="parent">↑</button><button data-action="clear">×</button>
        </div>
        <div class="row"><button data-action="record">● rec</button><button data-action="stop">■</button></div>
        <div class="summary"></div>
        <canvas hidden width="252" height="110"></canvas>
        <div hidden class="channels row"></div>
        <input hidden type="range" min="0" max="0" value="0"><div hidden class="sample"></div>
        <div class="row">
          <button data-action="copy">copy json</button><button data-action="close">hide ⌥⇧M</button>
        </div>
        <div class="help">CSS first frame runs at full speed (~16ms). Native smooth scrolling cannot be slowed.</div>
      </div>
    </section><div class="outline" hidden></div><div class="outline past" hidden></div>`;
  const section = root.querySelector('section')!;
  section.classList.toggle('compact', compact);
  const outline = root.querySelector<HTMLElement>('.outline')!;
  const past = root.querySelector<HTMLElement>('.past')!;
  const label = root.querySelector<HTMLElement>('.label')!;
  const slider = root.querySelector('input')!;
  const canvas = root.querySelector('canvas')!;
  const context = canvas.getContext('2d')!;
  const warning = getComputedStyle(host).getPropertyValue('--color-warning') || 'orange';
  function samples() {
    return trace?.targets.target ?? [];
  }
  function box(el: HTMLElement, rect: { x: number; y: number; width: number; height: number }) {
    el.hidden = false;
    Object.assign(el.style, {
      left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px',
    });
  }
  function select(el: Element | null) {
    picked = el;
    const attribute = el?.getAttributeNames().find((name) => name.startsWith('data-'));
    // Generated css() class names (rmxc-…) say nothing about the element, so skip them.
    const className = el ? [...el.classList].find((name) => !name.startsWith('rmxc-')) : undefined;
    const identity = attribute ? '[' + attribute + ']' : className ? '.' + className : '';
    const text = el?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 16) ?? '';
    label.textContent = el ? `${el.tagName.toLowerCase()}${identity} ${text}` : 'no target';
    outline.hidden = !el;
  }
  function draw() {
    const list = samples();
    context.clearRect(0, 0, 252, 110);
    if (!list.length) return;
    const v = velocities(list, channel);
    function line(values: number[], color: string, dots: boolean) {
      const min = Math.min(...values);
      const span = Math.max(...values) - min || 1;
      const duration = list.at(-1)!.t - list[0]!.t || 1;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.beginPath();
      const points = values.map((value, i) => ({
        x: 4 + (list[i]!.t - list[0]!.t) / duration * 244,
        y: 106 - (value - min) / span * 102,
      }));
      points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.stroke();
      if (dots) {
        for (const p of points) {
          context.beginPath();
          context.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    line(v, 'oklch(100% 0 0 / .25)', false);
    line(list.map((s) => s[channel]), '#c6f432', true);
    const summary = summarize(list, channel);
    root.querySelector('.summary')!.textContent =
      `${summary.durationMs.toFixed(0)}ms · ${summary.frames} fr · ` +
      `v ${summary.peakVelocity.toFixed(0)}/s · over ${summary.overshoot.toFixed(1)} · ` +
      `jump ${summary.firstFrameJump.toFixed(1)}`;
    slider.max = String(list.length - 1);
    scrub();
  }
  function scrub() {
    const list = samples();
    const index = Number(slider.value);
    const sample = list[index];
    if (!sample) return;
    root.querySelector('.sample')!.textContent =
      `f ${index + 1}/${list.length} · t ${sample.t.toFixed(0)}ms · ` +
      `${channel} ${sample[channel].toFixed(1)} · v ${velocities(list, channel)[index]!.toFixed(0)}/s`;
    box(past, { x: sample.x, y: sample.y, width: sample.w, height: sample.h });
  }
  slider.addEventListener('input', scrub);
  function completed(result: Trace) {
    trace = result;
    recording = null;
    channel = dominantChannel(samples());
    const channels = root.querySelector('.channels')!;
    channels.replaceChildren();
    for (const name of CHANNELS.filter((c) => range(samples(), c) > 0.5)) {
      const button = document.createElement('button');
      button.textContent = name;
      button.onclick = () => {
        channel = name;
        draw();
      };
      channels.append(button);
    }
    for (const element of [canvas, channels, slider, root.querySelector<HTMLElement>('.sample')!]) {
      (element as HTMLElement).hidden = false;
    }
    draw();
  }
  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.scale) {
      const scale = Number(button.dataset.scale);
      motionTime.setScale(scale);
      previousScale = scale;
      try {
        localStorage.setItem('otp:motion', String(scale));
      } catch {}
    }
    switch (button.dataset.action) {
      case 'compact':
        compact = !compact;
        section.classList.toggle('compact', compact);
        try {
          localStorage.setItem('otp:motion-compact', compact ? '1' : '0');
        } catch {}
        break;
      case 'pause':
        if (motionTime.scale) {
          previousScale = motionTime.scale;
          motionTime.setScale(0);
        } else {
          motionTime.setScale(previousScale);
        }
        break;
      case 'step':
        motionTime.step();
        stepAnimations();
        break;
      case 'pick':
        picking = true;
        break;
      case 'parent':
        select(picked?.parentElement ?? null);
        break;
      case 'clear':
        select(null);
        break;
      case 'record':
        if (picked && !recording) {
          recording = record({ target: picked });
          void recording.done.then(completed);
        }
        break;
      case 'stop':
        recording?.stop();
        break;
      case 'copy':
        if (trace) {
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(JSON.stringify(trace)).catch(() => console.log(trace));
          } else {
            console.log(trace);
          }
        }
        break;
      case 'close':
        onClose();
        break;
    }
  });
  const abort = new AbortController();
  document.addEventListener('pointerdown', (event) => {
    if (!picking || !event.isPrimary || event.button !== 0 || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopPropagation();
    picking = false;
    swallowClick = true;
    select(document.elementsFromPoint(event.clientX, event.clientY).find((el) => el !== host) ?? null);
  }, { capture: true, signal: abort.signal });
  document.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal: abort.signal });
  let frame = 0;
  function tick() {
    const scale = motionTime.scale;
    root.querySelector('[data-action="record"]')!.classList.toggle('active', !!recording);
    if (recording) {
      root.querySelector('.summary')!.textContent = `recording… ${recording.frames} frames`;
    }
    root.querySelector('.header')!.textContent = 'motion ' + scale + '×';
    (root.querySelector('.header') as HTMLElement).style.color = scale !== 1 ? warning : '';
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-scale]')) {
      button.classList.toggle('active', Number(button.dataset.scale) === scale);
    }
    root.querySelector<HTMLButtonElement>('[data-action="step"]')!.disabled = scale !== 0;
    root.querySelector('[data-action="pause"]')!.textContent = scale ? '⏸' : '▶';
    if (picked) box(outline, picked.getBoundingClientRect());
    frame = requestAnimationFrame(tick);
  }
  if (panel) frame = requestAnimationFrame(tick);
  return () => {
    abort.abort();
    cancelAnimationFrame(frame);
    recording?.stop();
    host.remove();
    uninstall();
    motionTime.setScale(1);
  };
}
