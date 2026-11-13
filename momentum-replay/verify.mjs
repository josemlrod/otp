// End-to-end verification of the momentum replay, against running servers:
//   44491 this branch, real football-data (free-tier key) + real FotMob
//   44492 origin/main, same key and sources: the "before"
//   44493 this branch, OTP_SCENARIO=matchday (pinned clock)
//   44494 origin/main, same scenario (pixel parity: no momentum, so nothing may change)
// Real mouse, touch-free pointer and keyboard input through Playwright, in Chromium and WebKit.

import { chromium, webkit } from 'playwright';
import { writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BRANCH = 'http://localhost:44491';
const MAIN = 'http://localhost:44492';
const BRANCH_SCN = 'http://localhost:44493';
const MAIN_SCN = 'http://localhost:44494';
const OUT = new URL('./', import.meta.url).pathname;
const PHONE = { width: 402, height: 874 };
const LAND = { width: 951, height: 620 };

const results = [];
function check(engine, name, ok, detail = '') {
  results.push({ engine, name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '✓' : '✗'} [${engine}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function open(browser, base, viewport, { follows, video } = {}) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark',
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  });
  await context.addCookies([{ name: 'otp_follows', value: follows, domain: 'localhost', path: '/' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForFunction(() => performance.getEntriesByName('otp:hydrated').length > 0);
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

const sheet = (page) => page.locator('[data-match-sheet]');
const headerScore = (page) =>
  sheet(page).locator('header p').nth(1).evaluate((p) => p.textContent.replace(/\s/g, ''));
const settle = (page, ms = 900) => page.waitForTimeout(ms);
const mainStrip = (page) => sheet(page).locator('[role="slider"]:not([data-compact])');
const dockStrip = (page) => sheet(page).locator('[role="slider"][data-compact]');
const statRow = (page, label) => sheet(page).locator('dl > div').filter({ hasText: label }).locator('dd');
const minutes = (texts) => texts.map((t) => Number(t.replace('′', '')));

async function dragOn(page, locator, fromFraction, toFraction, steps = 12, pause = 16) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromFraction, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + box.width * (fromFraction + ((toFraction - fromFraction) * i) / steps), y);
    await page.waitForTimeout(pause);
  }
  await page.mouse.up();
}

// Pick a result on the phone club card the way a person does: tap its pill, then the result.
async function openFromCard(page, clubId, matchId) {
  const item = page.locator('[data-fc]', { has: page.locator(`[data-match-opener="${matchId}"]`) });
  if ((await item.getAttribute('data-open')) === null) {
    await item.locator('button[aria-expanded]').click();
    await settle(page);
  }
  const pills = item.locator('[data-pill]');
  const ids = await item.locator('[data-match-opener]').evaluateAll((b) => b.map((x) => x.dataset.matchOpener));
  await pills.nth(ids.indexOf(String(matchId))).click();
  await settle(page);
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/clubs/${clubId}/matches/${matchId}`));
  await item.locator(`[data-match-opener="${matchId}"]`).click();
  const res = await response;
  await settle(page, 1200);
  return res;
}

const getJson = async (url) => (await fetch(url)).json();

// An independent reading of the report, written from FotMob's raw minutes rather than from
// match-replay.ts: where each point lands on the clock, and the minutes each side was on top.
function expectedOnTop(report) {
  const events = report.events;
  const first = Math.max(report.firstHalfInjuryTime ?? 0, ...events.filter((e) => e.minute <= 45).map((e) => e.injuryTime ?? 0));
  const half = 45 + first;
  const fullTime = half + 45 + (report.injuryTime ?? 0);
  const pts = [...report.momentum].sort((a, b) => a.minute - b.minute);
  const frac = (base) => pts.filter((p) => Math.floor(p.minute) === base && !Number.isInteger(p.minute));
  const at = (p) => {
    const m = p.minute;
    if (Number.isInteger(m)) return m <= 45 ? m : half + (m - 45);
    const base = Math.floor(m);
    const run = frac(base);
    const [a, b] = base === 45 ? [45, half] : [half + 45, fullTime];
    return a + ((b - a) * (run.indexOf(p) + 1)) / run.length;
  };
  const top = [0, 0];
  for (let i = 1; i < pts.length; i++) {
    const length = at(pts[i]) - at(pts[i - 1]);
    if (pts[i].value > 0) top[0] += length;
    if (pts[i].value < 0) top[1] += length;
  }
  return { top: top.map(Math.round), fullTime, firstHalfLast: half };
}

async function reportFlow(engine, browser, { clubId, matchId, follows, shots }) {
  const report = await getJson(`${BRANCH}/api/clubs/${clubId}/matches/${matchId}`);
  const title = `${report.home.name} ${report.fullTime.join('–')} ${report.away.name}`;
  check(engine, `${title}: the report carries FotMob momentum`, report.momentum?.length > 80, `${report.momentum?.length} points`);
  const { context, page, errors } = await open(browser, BRANCH, PHONE, { follows });

  const res = await openFromCard(page, clubId, matchId);
  check(engine, `${title}: the report is served`, res.status() === 200, `GET ${new URL(res.url()).pathname} → ${res.status()}`);
  check(engine, `${title}: the sheet opens on the match`, (await sheet(page).locator('h2').textContent()) === title);

  // The strip draws momentum, not lead bands: an unplayed and a played copy, each split home/away.
  const strip = mainStrip(page);
  check(engine, `${title}: the strip is in momentum mode`, (await strip.getAttribute('data-momentum')) === '');
  const shapes = await strip.evaluate((s) => ({
    bands: s.querySelectorAll('rect[data-side]').length,
    home: s.querySelectorAll('path[data-side="home"]').length,
    away: s.querySelectorAll('path[data-side="away"]').length,
  }));
  check(engine, `${title}: momentum replaces the lead bands`, shapes.bands === 0 && shapes.home === 2 && shapes.away === 2, JSON.stringify(shapes));

  // The curve spans the whole clock, kick-off to the whistle.
  const end = Number(await strip.getAttribute('aria-valuemax'));
  const box = await strip.locator('path[data-side="home"]').first().evaluate((p) => {
    const b = p.getBBox();
    return { x: b.x, right: b.x + b.width };
  });
  const expected = expectedOnTop(report);
  check(engine, `${title}: the curve runs from kick-off to the whistle`, Math.abs(box.x) < 0.01 && Math.abs(box.right - expected.fullTime) < 0.01, `x ${box.x.toFixed(2)} → ${box.right.toFixed(2)}, full time at ${expected.fullTime}, slider max ${end}`);

  // Home above the line is the home club's colour.
  const fills = await strip.evaluate((s) => ({
    home: getComputedStyle(s.querySelector('g:not([data-dim]) path[data-side="home"]')).fill,
    away: getComputedStyle(s.querySelector('g:not([data-dim]) path[data-side="away"]')).fill,
    us: getComputedStyle(s).getPropertyValue('--us'),
  }));
  check(engine, `${title}: home and away are drawn in different colours`, fills.home !== fills.away, `${fills.home} / ${fills.away}`);

  const legend = await sheet(page).locator('section[aria-label="Replay"] p').last().innerText();
  check(engine, `${title}: the legend explains momentum`, /^Momentum, minute by minute: \S+ on top above the line, \S+ below\.$/.test(legend), legend);

  const ft = minutes(await statRow(page, 'Time on top').allTextContents());
  check(engine, `${title}: time on top at full time matches the raw momentum`, ft.join() === expected.top.join(), `${ft.join(' – ')} (expected ${expected.top.join(' – ')})`);
  if (engine === 'webkit' && shots) await page.screenshot({ path: OUT + `${shots}-full-time.png` });

  // Scrub back: the played part of the curve follows the playhead and time on top rewinds.
  await dragOn(page, strip, 0.97, 0.55);
  await settle(page);
  const now = Number(await strip.getAttribute('aria-valuenow'));
  const clip = Number(await strip.locator('[data-clip]').getAttribute('width'));
  check(engine, `${title}: the played part of the curve ends at the playhead`, Math.abs(clip - now) <= 0.6, `clip ${clip.toFixed(2)}, playhead ${now} (${await strip.getAttribute('aria-valuetext')})`);
  const mid = minutes(await statRow(page, 'Time on top').allTextContents());
  check(engine, `${title}: time on top rewinds with the strip`, mid[0] <= ft[0] && mid[1] <= ft[1] && mid[0] + mid[1] <= now + 1 && mid.join() !== ft.join(), `${mid.join(' – ')} at ${await strip.getAttribute('aria-valuetext')}`);
  const timeOnTopRewound = await sheet(page).locator('dl > div').filter({ hasText: 'Time on top' }).evaluate((row) => getComputedStyle(row.querySelector('dd')).opacity);
  check(engine, `${title}: time on top isn't dimmed like full-time totals`, timeOnTopRewound === '1', `opacity ${timeOnTopRewound}`);
  if (engine === 'webkit' && shots) await page.screenshot({ path: OUT + `${shots}-scrubbed.png` });

  await strip.focus();
  await page.keyboard.press('Home');
  await settle(page, 1200);
  const ko = minutes(await statRow(page, 'Time on top').allTextContents());
  check(engine, `${title}: Home goes to kick-off: 0–0 and no time on top`, (await headerScore(page)) === '0–0' && ko.join() === '0,0', `${await headerScore(page)}, ${ko.join(' – ')}`);
  await page.keyboard.press('End');
  await settle(page, 1200);
  check(engine, `${title}: End returns to full time`, (await headerScore(page)) === report.fullTime.join('–') && minutes(await statRow(page, 'Time on top').allTextContents()).join() === ft.join());

  // The docked strip draws the same momentum and still scrubs.
  await page.locator('[data-match-sheet] > div[tabindex]').evaluate((n) => (n.scrollTop = 700));
  await settle(page, 800);
  const docked = await sheet(page).getAttribute('data-docked');
  const dock = dockStrip(page);
  const dockShapes = await dock.evaluate((s) => s.querySelectorAll('path[data-side]').length);
  check(engine, `${title}: the docked strip draws momentum too`, docked === '' && (await dock.getAttribute('data-momentum')) === '' && dockShapes === 4, `docked=${docked} paths=${dockShapes}`);
  await dragOn(page, dock, 0.95, 0.3);
  await settle(page);
  const dockNow = Number(await dock.getAttribute('aria-valuenow'));
  const dockClip = Number(await dock.locator('[data-clip]').getAttribute('width'));
  check(engine, `${title}: scrubbing the docked strip moves its played part`, dockNow < end * 0.5 && Math.abs(dockClip - dockNow) <= 0.6, `at ${await dock.getAttribute('aria-valuetext')}, clip ${dockClip.toFixed(2)}`);
  if (engine === 'webkit' && shots) await page.screenshot({ path: OUT + `${shots}-docked.png` });

  check(engine, `${title}: no console errors`, errors.length === 0, errors.join(' | '));
  await context.close();
  return report;
}

async function beforeFlow(engine, browser, { clubId, matchId, follows }) {
  const { context, page, errors } = await open(browser, MAIN, PHONE, { follows });
  await openFromCard(page, clubId, matchId);
  const strip = mainStrip(page);
  const bands = await strip.evaluate((s) => s.querySelectorAll('rect[data-side]').length);
  check(engine, 'main, same match: the strip only shades who was ahead', bands > 0 && (await strip.getAttribute('data-momentum')) === null, `${bands} lead bands`);
  check(engine, 'main: no time on top row', (await sheet(page).getByText('Time on top').count()) === 0);
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'before-main.png' });
  check(engine, 'main: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function wideFlow(engine, browser, { clubId, matchId, follows }) {
  const { context, page, errors } = await open(browser, BRANCH, LAND, { follows });
  await page.locator(`[data-match-opener="${matchId}"]`).click();
  await settle(page, 1500);
  const strip = mainStrip(page);
  check(engine, 'Duo landscape: the strip draws momentum', (await strip.getAttribute('data-momentum')) === '');
  await dragOn(page, strip, 0.97, 0.4);
  await settle(page);
  const mid = minutes(await statRow(page, 'Time on top').allTextContents());
  check(engine, 'Duo landscape: time on top rewinds', mid.every((n) => Number.isFinite(n)), mid.join(' – '));
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'duo-landscape.png' });
  check(engine, 'Duo landscape: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// Scenarios answer from fixtures and never reach FotMob, so they have no momentum: the sheet must
// still shade lead bands, pixel-identical to main.
async function parityFlow(engine, browser) {
  for (const [clubId, matchId, what] of [[57, 5704, 'Deep Data match'], [81, 8104, 'free-tier match']]) {
    const hashes = [];
    for (const base of [MAIN_SCN, BRANCH_SCN]) {
      const { context, page } = await open(browser, base, PHONE, { follows: '57.81' });
      await openFromCard(page, clubId, matchId);
      const png = await page.screenshot();
      hashes.push(createHash('sha256').update(png).digest('hex').slice(0, 16));
      if (engine === 'webkit' && matchId === 5704) {
        await writeFile(OUT + `parity-${base === MAIN_SCN ? 'main' : 'branch'}-scenario.png`, png);
      }
      await context.close();
    }
    check(engine, `scenario ${what}: sheet is pixel-identical to main`, hashes[0] === hashes[1], hashes.join(' vs '));
  }
}

async function recordGif(browser, { clubId, matchId, follows }) {
  const dir = OUT + 'video/';
  await mkdir(dir, { recursive: true });
  const { context, page } = await open(browser, BRANCH, PHONE, { follows, video: dir });
  await openFromCard(page, clubId, matchId);
  await settle(page, 600);
  await dragOn(page, mainStrip(page), 0.97, 0.03, 50, 40);
  await settle(page, 500);
  await dragOn(page, mainStrip(page), 0.03, 0.62, 50, 40);
  await settle(page, 900);
  await page.locator('[data-match-sheet] > div[tabindex]').evaluate((n) => n.scrollTo({ top: 640, behavior: 'smooth' }));
  await settle(page, 1200);
  await dragOn(page, dockStrip(page), 0.62, 0.95, 30, 40);
  await settle(page, 1200);
  await context.close();
  const [file] = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
  await rename(dir + file, OUT + 'scrub.webm');
}

const united = { clubId: 66, follows: '66.64', matchId: 560639 };
const liverpool = { clubId: 64, follows: '64.66', matchId: 575363 };

for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await launcher.launch();
  await reportFlow(engine, browser, { ...united, shots: 'united-villa' });
  await reportFlow(engine, browser, { ...liverpool, shots: 'liverpool-villarreal' });
  await beforeFlow(engine, browser, united);
  await wideFlow(engine, browser, united);
  await parityFlow(engine, browser);
  if (engine === 'chromium') await recordGif(browser, united);
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass`);
await writeFile(OUT + 'verification.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
