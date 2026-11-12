import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { interactions } from './interactions.ts';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    label: { type: 'string' },
    interaction: { type: 'string' },
    scale: { type: 'string', default: '0.25' },
    browser: { type: 'string', default: 'chromium' },
    reduced: { type: 'boolean', default: false },
    out: { type: 'string', default: 'motion-captures' },
  },
});
const { url, label, interaction, browser: engine, reduced, out } = values;
const scale = Number(values.scale);
if (!url || !label || !interaction) throw new Error('--url, --label and --interaction are required');
if (!/^[\w-]+$/.test(label)) {
  throw new Error('Label must contain only letters, numbers, underscores or hyphens');
}
if (!(scale > 0 && Number.isFinite(scale))) throw new Error('--scale must be positive');
if (engine !== 'chromium' && engine !== 'webkit') throw new Error('--browser must be chromium or webkit');

const names = interaction === 'all' ? Object.keys(interactions) : [interaction];
for (const name of names) {
  const interaction = interactions[name];
  if (!interaction) throw new Error('Unknown interaction: ' + name);
  const tmpDir = await mkdtemp(join(tmpdir(), 'otp-motion-'));
  const browser = await (await import('playwright'))[engine].launch();
  try {
    const viewport = interaction.viewport ?? { width: 402, height: 874 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      hasTouch: true,
      colorScheme: 'dark',
      reducedMotion: reduced ? 'reduce' : 'no-preference',
      recordVideo: { dir: tmpDir, size: viewport },
    });
    await context.addCookies([{
      name: 'otp_follows',
      value: '57.64.5',
      domain: new URL(url).hostname,
      path: '/',
    }]);
    const page = await context.newPage();
    await page.goto(new URL('/?motion=' + scale + '&motionPanel=0', url).href);
    await page.waitForFunction(() =>
      performance.getEntriesByName('otp:hydrated').length > 0 && !!window.__otpMotion,
    );
    await page.waitForTimeout(1000);
    const trace = await interaction.run(page, { scale });
    const video = page.video()!;
    await context.close();
    const dir = join(out!, name, label);
    await mkdir(dir, { recursive: true });
    await video.saveAs(join(dir, 'video.webm'));
    await writeFile(join(dir, 'trace.json'), JSON.stringify(trace, null, 2));
    const meta = {
      url, label, scale, browser: engine, reduced, viewport, capturedAt: new Date().toISOString(),
    };
    await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    const counts = Object.entries(trace.targets).map(([key, samples]) => key + '=' + samples.length);
    console.log(name + ': ' + dir + ' (' + counts.join(', ') + ')');
  } finally {
    await browser.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
}
