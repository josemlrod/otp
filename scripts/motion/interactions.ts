import type { Page } from 'playwright';
import type { Trace } from '../../app/actions/public/motion-lab/trace.ts';
import type { Channel } from '../../app/actions/public/motion-lab/stats.ts';

declare global {
  interface Window {
    __otpRec: { done: Promise<Trace>; stop: () => Trace };
  }
}

export type Interaction = {
  description: string;
  viewport?: { width: number; height: number };
  channels?: Record<string, Channel>;
  run(page: Page, opts: { scale: number }): Promise<Trace>;
};

export async function startRecording(page: Page, targets: Record<string, string>) {
  await page.evaluate((targets) => {
    window.__otpRec = window.__otpMotion!.record(targets);
  }, targets);
  // Resolve existing targets before the action can change their selector.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

export async function finishRecording(page: Page): Promise<Trace> {
  return page.evaluate(() => window.__otpRec.done);
}

type Point = { x: number; y: number };
type DragOptions = { moves: number; gapMs: number; holdMs: number };

export async function drag(page: Page, from: Point, to: Point, options: DragOptions) {
  const { moves, gapMs, holdMs } = options;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'left' });
  for (let i = 1; i <= moves; i++) {
    await page.waitForTimeout(gapMs);
    await page.mouse.move(
      from.x + (to.x - from.x) * i / moves,
      from.y + (to.y - from.y) * i / moves,
    );
  }
  await page.waitForTimeout(holdMs);
  await page.mouse.up({ button: 'left' });
}

const targets = { sheet: '[role=dialog]', screen: 'main' };
const channels = { sheet: 'y', screen: 'sx' } as const;
const tile = (page: Page) => page.locator('main button:has(img[alt$="crest"])').first();

async function open(page: Page, scale: number) {
  await tile(page).click();
  await page.waitForTimeout(Math.ceil(600 / scale));
}

async function pull(page: Page, distance: number, options: DragOptions) {
  const box = await page.locator('[role=dialog] [data-sheet-grab]').first().boundingBox();
  if (!box) throw new Error('Sheet grab header is missing');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x, y: from.y + distance }, options);
}

async function finishSheet(page: Page, name: string, expected: 'open' | 'closed') {
  const trace = await finishRecording(page);
  const actual = await page.locator('[role=dialog]').evaluate((element) =>
    element.getAttribute('aria-hidden') === 'false' && !(element as HTMLElement).inert ? 'open' : 'closed',
  );
  if (actual !== expected) {
    throw new Error(`${name}: expected sheet ${expected} after recording, got ${actual}`);
  }
  console.log(`${name}: outcome=${actual}`);
  return trace;
}

export const interactions: Record<string, Interaction> = {
  'sheet-tap-open': {
    description: 'Tap the first competition tile to open its sheet.',
    channels,
    async run(page) {
      await startRecording(page, targets);
      await tile(page).click();
      return finishSheet(page, 'sheet-tap-open', 'open');
    },
  },
  'sheet-flick-close': {
    description: 'Pull quickly past 70% of sheet travel, then release to close.',
    channels,
    async run(page, { scale }) {
      await open(page, scale);
      const travel = await page.locator('[role=dialog]').evaluate((el) => (el as HTMLElement).offsetHeight + 30);
      await startRecording(page, targets);
      // Distance alone clears the half-travel decision, even if release velocity is lost.
      await pull(page, travel * 0.7, { moves: 6, gapMs: 8, holdMs: 0 });
      return finishSheet(page, 'sheet-flick-close', 'closed');
    },
  },
  'sheet-short-pull': {
    description: 'Pull down 120px and hold before release.',
    channels,
    async run(page, { scale }) {
      await open(page, scale);
      await startRecording(page, targets);
      // A 150ms hold clears the 100ms velocity window in both release implementations.
      await pull(page, 120, { moves: 12, gapMs: 25, holdMs: 150 });
      return finishSheet(page, 'sheet-short-pull', 'open');
    },
  },
  'sheet-catch': {
    description: 'Catch the sheet mid-rise, pull down 40px and hold.',
    channels,
    async run(page, { scale }) {
      await startRecording(page, targets);
      await tile(page).click();
      await page.waitForTimeout(120 / scale);
      await pull(page, 40, { moves: 4, gapMs: 20, holdMs: 150 });
      return finishSheet(page, 'sheet-catch', 'open');
    },
  },
  'picker-fly': {
    description: 'Pick a club and trace the flying crest and new chip.',
    channels: { ghost: 'ty', chip: 'sx' },
    async run(page, { scale }) {
      await page.locator('[data-clubs-opener]').click();
      await page.waitForTimeout(Math.ceil(600 / scale));
      const existing = await page.locator('[data-chip]').evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('data-chip')!),
      );
      const chip = '[data-chip]' + existing.map((id) => `:not([data-chip="${id}"])`).join('');
      await startRecording(page, { ghost: 'body > [data-club-crest]', chip });
      await page.locator('[role=dialog] [data-section] button[aria-pressed="false"]').first().click();
      return finishRecording(page);
    },
  },
  'wide-page-swap': {
    description: 'Select the second sidebar item and trace both pages.',
    channels: { old: 'opacity', next: 'opacity' },
    viewport: { width: 951, height: 620 },
    async run(page, { scale }) {
      await page.waitForTimeout(Math.ceil(600 / scale));
      await startRecording(page, { old: '[data-page]:not([data-leave])', next: '[data-page][data-enter]' });
      await page.locator('[data-item]').nth(1).click();
      return finishRecording(page);
    },
  },
};
