// End-to-end verification of FotMob-filled match reports, against running servers:
//   44391 this branch, real football-data (free-tier key) + real FotMob
//   44392 origin/main, real football-data (free-tier key): the "before"
//   44393 this branch, OTP_SCENARIO=matchday (pinned clock)
//   44394 origin/main, same scenario (pixel parity: scenarios must not change)
// Real mouse and keyboard input through Playwright, in Chromium and WebKit.

import { chromium, webkit } from 'playwright';
import { writeFile, readdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BRANCH = 'http://localhost:44391';
const MAIN = 'http://localhost:44392';
const BRANCH_SCN = 'http://localhost:44393';
const MAIN_SCN = 'http://localhost:44394';
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

const shortName = (name) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
};
const label = (e) => (e.injuryTime ? `${e.minute}+${e.injuryTime}'` : `${e.minute}'`);

// The score a strip label ("52'", "45+2'") should show, from the report's goals.
function scoreAtLabel(report, text) {
  const m = text.match(/^(\d+)(?:\+(\d+))?'$/);
  if (!m) return null;
  const at = [Number(m[1]), Number(m[2] ?? 0)];
  let score = [0, 0];
  for (const g of report.events.filter((e) => e.kind === 'goal')) {
    const stamp = [g.minute, g.injuryTime ?? 0];
    if (stamp[0] < at[0] || (stamp[0] === at[0] && stamp[1] <= at[1])) score = g.score;
  }
  return score.join('–');
}

const getJson = async (url) => (await fetch(url)).json();

async function reportFlow(engine, browser, { clubId, matchId, follows, shots }) {
  const report = await getJson(`${BRANCH}/api/clubs/${clubId}/matches/${matchId}`);
  const title = `${report.home.name} ${report.fullTime.join('–')} ${report.away.name}`;
  const { context, page, errors } = await open(browser, BRANCH, PHONE, { follows });

  const res = await openFromCard(page, clubId, matchId);
  check(engine, `${title}: the report is served`, res.status() === 200, `GET ${new URL(res.url()).pathname} → ${res.status()}`);
  check(engine, `${title}: the sheet opens on the match`, (await sheet(page).locator('h2').textContent()) === title);
  check(engine, `${title}: the replay strip is there (events came from FotMob)`, (await mainStrip(page).count()) === 1);

  const goals = report.events.filter((e) => e.kind === 'goal');
  check(engine, `${title}: one goal per goal in the score`, goals.length === report.fullTime[0] + report.fullTime[1], `${goals.length} goals`);
  const scorers = await sheet(page).locator('header ol li').allTextContents();
  const want = goals.map((g) => `${shortName(g.player)}${g.goal === 'own' ? ' (og)' : g.goal === 'penalty' ? ' (pen)' : ''} ${label(g)}`);
  check(engine, `${title}: the header lists every scorer with the minute`, want.every((w) => scorers.map((s) => s.replace(/\s+/g, ' ').trim()).includes(w)), scorers.join(' · '));

  const moments = await sheet(page).locator('button[data-kind]').count();
  check(engine, `${title}: every goal, card and sub is a key moment`, moments === report.events.length, `${moments} moments, ${report.events.length} events`);
  const assists = goals.filter((g) => g.assist).map((g) => `Assist ${shortName(g.assist)}`);
  const momentText = await sheet(page).locator('button[data-kind="goal"]').allTextContents();
  check(engine, `${title}: assists show on goals`, assists.every((a) => momentText.some((t) => t.includes(a))), assists.join(', ') || 'no assists in this match');

  const xgRow = sheet(page).locator('dl > div').filter({ hasText: 'Expected goals' });
  const xg = await xgRow.locator('dd').allTextContents();
  check(engine, `${title}: the stats card shows xG`, xg.join(' ') === report.stats.xg.map((n) => n.toFixed(2)).join(' '), xg.join(' – '));
  const possession = await sheet(page).locator('dl > div').filter({ hasText: 'Possession' }).locator('dd').allTextContents();
  check(engine, `${title}: possession comes through`, possession.join(' ') === report.stats.possession.map((n) => `${n}%`).join(' '), possession.join(' – '));
  if (engine === 'webkit' && shots) await page.screenshot({ path: OUT + `${shots}-full-time.png` });

  // Scrub to the middle of the match and check the score against the report's goals.
  await dragOn(page, mainStrip(page), 0.97, 0.55);
  await settle(page);
  const at = await mainStrip(page).getAttribute('aria-valuetext');
  const expected = scoreAtLabel(report, at);
  check(engine, `${title}: scrubbing rewinds the score to match the goals`, (await headerScore(page)) === expected, `at ${at}: ${await headerScore(page)} (expected ${expected})`);
  if (engine === 'webkit' && shots) await page.screenshot({ path: OUT + `${shots}-scrubbed.png` });

  const strip = mainStrip(page);
  await strip.focus();
  await page.keyboard.press('Home');
  await settle(page, 1200);
  check(engine, `${title}: Home goes to kick-off at 0–0`, (await headerScore(page)) === '0–0', await strip.getAttribute('aria-valuetext'));
  await page.keyboard.press('End');
  await settle(page, 1200);
  check(engine, `${title}: End returns to full time`, (await headerScore(page)) === report.fullTime.join('–'));

  if (engine === 'webkit' && shots) {
    await sheet(page).locator('button[data-kind]').last().scrollIntoViewIfNeeded();
    await settle(page, 700);
    await page.screenshot({ path: OUT + `${shots}-moments.png` });
  }
  check(engine, `${title}: no console errors`, errors.length === 0, errors.join(' | '));
  await context.close();
  return report;
}

async function beforeFlow(engine, browser, { clubId, matchId, follows }) {
  const { context, page, errors } = await open(browser, MAIN, PHONE, { follows });
  await openFromCard(page, clubId, matchId);
  const text = await sheet(page).innerText();
  check(engine, 'main, same match: free tier keeps to the score, no strip', /aren't available/.test(text) && (await mainStrip(page).count()) === 0, (await sheet(page).locator('h2').textContent()));
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'before-main-free-tier.png' });
  check(engine, 'main: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function wideFlow(engine, browser, { clubId, matchId, follows }) {
  const { context, page, errors } = await open(browser, BRANCH, LAND, { follows });
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/clubs/${clubId}/matches/${matchId}`));
  await page.locator(`[data-match-opener="${matchId}"]`).click();
  check(engine, 'Duo landscape: a Last 5 row opens the FotMob-filled match', (await response).status() === 200);
  await settle(page, 1200);
  check(engine, 'Duo landscape: the replay strip is there', (await mainStrip(page).count()) === 1);
  const tops = await sheet(page).locator('section:not([aria-label])').evaluateAll((s) => s.map((x) => Math.round(x.getBoundingClientRect().top)));
  check(engine, 'Duo landscape: stats and key moments sit side by side', tops.length === 2 && tops[0] === tops[1], tops.join(','));
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'duo-landscape.png' });
  check(engine, 'Duo landscape: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// Scenarios answer from fixtures and never reach FotMob, so their sheets must be pixel-identical.
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

async function recordGif(clubId, matchId, follows) {
  const dir = OUT + 'video/';
  const { context, page } = await open(chromium.__browser, BRANCH, PHONE, { follows, video: dir });
  await openFromCard(page, clubId, matchId);
  await dragOn(page, mainStrip(page), 0.97, 0.05, 40, 40);
  await settle(page, 600);
  await dragOn(page, mainStrip(page), 0.05, 0.75, 40, 40);
  await settle(page, 800);
  const goal = sheet(page).locator('button[data-kind="goal"]').last();
  await goal.scrollIntoViewIfNeeded();
  await settle(page, 500);
  await goal.click();
  await settle(page, 1500);
  await context.close();
  const [file] = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
  await rename(dir + file, OUT + 'scrub.webm');
}

const madrid = { clubId: 86, follows: '86.64' };
const liverpool = { clubId: 64, follows: '64.86' };
const madridForm = (await getJson(`${BRANCH}/api/clubs/86/matches`)).form;
const clasico = madridForm.find((m) => m.opponent.name === 'Barça');
const liverpoolForm = (await getJson(`${BRANCH}/api/clubs/64/matches`)).form;
const sevenGoals = liverpoolForm.find((m) => m.gf + m.ga === 7);

for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await launcher.launch();
  await reportFlow(engine, browser, { ...madrid, matchId: clasico.id, shots: 'clasico' });
  await reportFlow(engine, browser, { ...liverpool, matchId: sevenGoals.id, shots: 'liverpool-villarreal' });
  await beforeFlow(engine, browser, { ...madrid, matchId: clasico.id });
  await wideFlow(engine, browser, { ...madrid, matchId: clasico.id });
  await parityFlow(engine, browser);
  if (engine === 'chromium') {
    chromium.__browser = browser;
    await recordGif(madrid.clubId, clasico.id, madrid.follows);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass`);
await writeFile(OUT + 'verification.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
