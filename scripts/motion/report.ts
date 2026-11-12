import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dominantChannel, summarize, velocities } from '../../app/actions/public/motion-lab/stats.ts';
import type { Channel, Summary } from '../../app/actions/public/motion-lab/stats.ts';
import type { Sample, Trace } from '../../app/actions/public/motion-lab/trace.ts';
import { interactions } from './interactions.ts';

const { values } = parseArgs({
  options: {
    interaction: { type: 'string' },
    out: { type: 'string', default: 'motion-captures' },
    before: { type: 'string', default: 'before' },
    after: { type: 'string', default: 'after' },
  },
});
const { interaction, out, before, after } = values;
if (!interaction || !interactions[interaction]) throw new Error('--interaction must name an interaction');
for (const label of [before!, after!]) {
  if (!/^[\w-]+$/.test(label)) throw new Error('Invalid label');
}
const dir = join(out!, interaction);

async function load(label: string) {
  const trace = JSON.parse(await readFile(join(dir, label, 'trace.json'), 'utf8')) as Trace;
  const meta = JSON.parse(await readFile(join(dir, label, 'meta.json'), 'utf8'));
  return { trace, meta };
}

const [a, b] = await Promise.all([load(before!), load(after!)]);

function escape(value: unknown) {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]!);
}

type Point = { t: number; value: number };

function chart(series: Point[][], height: number) {
  const all = series.flat();
  if (!all.length) return '<p>No samples</p>';
  const maxT = Math.max(...all.map((s) => s.t), 1);
  const min = Math.min(...all.map((s) => s.value));
  const max = Math.max(...all.map((s) => s.value));
  const point = (s: Point) => [
    36 + s.t / maxT * 594,
    height - 24 - (s.value - min) / (max - min || 1) * (height - 40),
  ];
  const curves = series.map((list, i) => {
    const color = i ? '#c6f432' : '#8a8f98';
    const dots = list.map((s) => {
      const [x, y] = point(s);
      return `<circle cx="${x}" cy="${y}" r="2" stroke="none"/>`;
    }).join('');
    return `
      <g fill="${color}" stroke="${color}">
        <polyline fill="none" stroke-width="${i ? 2 : 1.5}"
          ${i ? '' : 'stroke-dasharray="5 4"'}
          points="${list.map((s) => point(s).join(',')).join(' ')}"/>
        ${dots}
      </g>`;
  }).join('');
  return `
    <svg viewBox="0 0 640 ${height}" role="img" aria-label="Before and after curves">
      <text x="2" y="12">${max.toFixed(1)}</text>
      <text x="2" y="${height - 25}">${min.toFixed(1)}</text>
      <text x="36" y="${height - 3}">0 ms</text>
      <text x="540" y="${height - 3}">${maxT.toFixed(0)} ms</text>
      ${curves}
    </svg>`;
}

const labels: Record<keyof Summary, string> = {
  durationMs: 'duration (ms)',
  frames: 'frames',
  peakVelocity: 'peak velocity (/s)',
  overshoot: 'overshoot',
  firstFrameJump: 'first-frame jump',
  maxFrameDelta: 'max frame delta',
};

function statsTable(stats: Summary[]) {
  const rows = (Object.keys(labels) as (keyof Summary)[]).map((key) => {
    const delta = stats[1]![key] - stats[0]![key];
    return `
      <tr>
        <td>${labels[key]}</td>
        <td>${stats[0]![key].toFixed(2)}</td>
        <td>${stats[1]![key].toFixed(2)}</td>
        <td>${delta > 0 ? '+' : ''}${delta.toFixed(2)}</td>
      </tr>`;
  }).join('');
  return `
    <table>
      <tr><th>Metric</th><th>${escape(before)}</th><th>${escape(after)}</th><th>Δ</th></tr>
      ${rows}
    </table>`;
}

function targetPlot(target: string) {
  const lists = [a.trace.targets[target] ?? [], b.trace.targets[target] ?? []];
  const channel: Channel = interactions[interaction!]!.channels?.[target] ?? dominantChannel(lists[0]!);
  const stats = lists.map((list) => summarize(list, channel));
  console.log(target + ' (' + channel + '): ' + JSON.stringify(stats));
  const positions = lists.map((list) => list.map((s) => ({ t: s.t, value: s[channel] })));
  const speeds = lists.map((list) => {
    const v = velocities(list, channel);
    return list.map((s, i) => ({ t: s.t, value: v[i]! }));
  });
  return `
    <section>
      <h2>${escape(target)} · ${channel}</h2>
      <p>before dashed grey · after green</p>
      ${chart(positions, 220)}
      ${chart(speeds, 90)}
      ${statsTable(stats)}
    </section>`;
}

// Integrate the intersection of piecewise-linear opacity intervals on shared t.
// No extrapolation beyond either target's samples, including after detachment.
function visibleIntervals(samples: Sample[]): [number, number][] {
  const intervals: [number, number][] = [];
  for (let i = 1; i < samples.length; i++) {
    const left = samples[i - 1]!;
    const right = samples[i]!;
    const a = left.opacity > 0.15;
    const b = right.opacity > 0.15;
    if (!a && !b) continue;
    const crossing = left.t + (0.15 - left.opacity) / (right.opacity - left.opacity) * (right.t - left.t);
    intervals.push([a ? left.t : crossing, b ? right.t : crossing]);
  }
  return intervals;
}

function overlapMs(trace: Trace) {
  const old = visibleIntervals(trace.targets.old ?? []);
  const next = visibleIntervals(trace.targets.next ?? []);
  let duration = 0;
  for (const [a, b] of old) {
    for (const [c, d] of next) duration += Math.max(0, Math.min(b, d) - Math.max(a, c));
  }
  return duration;
}

function overlapLine() {
  if (interaction !== 'wide-page-swap') return '';
  const overlap = [overlapMs(a.trace), overlapMs(b.trace)];
  console.log('both-visible overlap (ms): ' + JSON.stringify(overlap));
  return `<p>Both-visible overlap (old.opacity &gt; 0.15 and next.opacity &gt; 0.15):
    ${escape(before)} ${overlap[0]!.toFixed(2)} ms · ${escape(after)} ${overlap[1]!.toFixed(2)} ms
    of animation time. Linear interpolation between samples on shared t.</p>`;
}

function videos() {
  return [before!, after!].map((label) => `
    <figure>
      <figcaption>${escape(label)}</figcaption>
      <video src="${escape(label)}/video.webm" controls muted loop playsinline></video>
    </figure>`).join('');
}

function metadata() {
  return [a, b].map(({ meta }) => `
    <p>${escape(meta.label)}: ${escape(meta.scale)}× · ${escape(meta.browser)} ·
      ${escape(meta.url)} · reduced motion ${meta.reduced ? 'on' : 'off'}</p>`).join('');
}

const targets = [...new Set([...Object.keys(a.trace.targets), ...Object.keys(b.trace.targets)])];
const plots = targets.map(targetPlot).join('');
const html = `<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escape(interaction)} motion report</title>
  <style>
    body {
      background: #0b0d10; color: #eef0f3; font-family: ui-monospace, monospace;
      max-width: 1000px; margin: 24px auto; padding: 0 16px;
    }
    .videos { display: flex; }
    .videos figure { width: 50%; margin: 0; }
    video { width: 100%; }
    svg { width: 100%; display: block; max-width: 640px; }
    svg text { fill: #8a8f98; font-size: 10px; }
    table { border-collapse: collapse; }
    td, th { text-align: left; padding: 6px 18px 6px 0; }
    section { margin: 32px 0; }
    button, select { font: inherit; }
    @media(max-width: 700px) {
      .videos { display: block; }
      .videos figure { width: 100%; }
    }
  </style>
  <h1>${escape(interaction)}</h1>
  <p>${escape(interactions[interaction]!.description)}</p>
  ${metadata()}
  <button id="play">play both</button>
  <label>Playback rate
    <select id="rate"><option>1</option><option>0.5</option><option>0.25</option></select>
  </label>
  <div class="videos">${videos()}</div>
  ${overlapLine()}
  ${plots}
  <script>
    const videos = [...document.querySelectorAll('video')];
    document.querySelector('#play').onclick = () => videos.forEach((video) => {
      video.currentTime = 0;
      video.play();
    });
    document.querySelector('#rate').onchange = (event) => videos.forEach((video) => {
      video.playbackRate = Number(event.target.value);
    });
  </script>
</html>`;
await writeFile(join(dir, 'report.html'), html);
console.log(join(dir, 'report.html'));
