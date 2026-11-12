// End-to-end verification of the match sheet against running servers:
//   44121 this branch, OTP_SCENARIO=matchday (pinned clock)
//   44122 origin/main, same scenario (for pixel parity of existing screens)
//   44123 this branch against the real football-data API (free-tier key)
// Real mouse, keyboard and wheel input through Playwright, in Chromium and WebKit.

import { chromium, webkit } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BRANCH = 'http://localhost:44121';
const MAIN = 'http://localhost:44122';
const REAL = 'http://localhost:44123';
const OUT = new URL('./', import.meta.url).pathname;
const NOW = new Date('2026-11-08T12:00:00Z');
const PHONE = { width: 402, height: 874 };
const COVER = { width: 382, height: 600 };
const INNER = { width: 669, height: 902 };
const LAND = { width: 951, height: 620 };

const results = [];
function check(engine, name, ok, detail = '') {
  results.push({ engine, name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '✓' : '✗'} [${engine}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function open(browser, base, viewport, { follows = '57.81', reduced = false, video } = {}) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
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
const live = (page) => sheet(page).locator('header [data-live]').count();
const settle = (page, ms = 900) => page.waitForTimeout(ms);

async function dragOn(page, locator, fromFraction, toFraction, steps = 12) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromFraction, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + box.width * (fromFraction + ((toFraction - fromFraction) * i) / steps), y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

// Pick a result on the phone club card the way a person does: tap its pill, then the result.
async function openFromCard(page, clubName, matchId) {
  const item = page.locator('[data-fc]', { has: page.locator(`[data-match-opener="${matchId}"]`) });
  if ((await item.getAttribute('data-open')) === null) {
    await item.locator('button[aria-expanded]').click();
    await settle(page);
  }
  const pills = item.locator('[data-pill]');
  const ids = await item.locator('[data-match-opener]').evaluateAll((b) => b.map((x) => x.dataset.matchOpener));
  await pills.nth(ids.indexOf(String(matchId))).click();
  await settle(page);
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/clubs/${clubName}/matches/${matchId}`));
  await item.locator(`[data-match-opener="${matchId}"]`).click();
  return response;
}

async function phoneFlow(engine, browser) {
  const { context, page, errors } = await open(browser, BRANCH, PHONE);

  const response = await openFromCard(page, 57, 5704);
  check(engine, 'tapping a picked result requests its report', response.status() === 200, `GET ${new URL(response.url()).pathname} → ${response.status()}`);
  await settle(page, 1200);
  const title = await sheet(page).locator('h2').textContent();
  check(engine, 'sheet opens on the right match', title === 'Arsenal 2–0 Liverpool', title);
  check(engine, 'header starts at full time', (await headerScore(page)) === '2–0' && (await live(page)) === 0, await headerScore(page));
  const strip = sheet(page).locator('[role="slider"]:not([data-compact])');
  check(engine, 'strip starts at full time', (await strip.getAttribute('aria-valuetext')) === 'Full time');
  const overflow = await sheet(page).locator('dl').evaluate((card) => {
    const edge = card.getBoundingClientRect();
    return [...card.querySelectorAll('dd, dt, p span')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > edge.right - 4 || r.left < edge.left + 4;
    }).map((el) => el.textContent);
  });
  check(engine, 'every stat value sits inside its card', overflow.length === 0, overflow.join(', ') || 'all inside');
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'phone-full-time.png' });

  // Scrub to the middle: between the 33' and 71' goals.
  await dragOn(page, strip, 0.95, 0.5);
  await settle(page);
  const mid = await strip.getAttribute('aria-valuetext');
  check(engine, 'dragging the strip rewinds the score', (await headerScore(page)) === '1–0', `at ${mid}: ${await headerScore(page)}`);
  check(engine, 'the clock chip goes live with the minute', (await live(page)) === 1, await sheet(page).locator('header [data-live]').textContent());
  const caption = await sheet(page).locator('section[aria-label="Replay"] p').nth(1).textContent();
  check(engine, 'the caption describes the state of the game', /ahead since/.test(caption), caption);
  const front = await sheet(page).locator('dl > div').filter({ hasText: 'Time in front' }).locator('dd').first().textContent();
  check(engine, 'time in front rewinds with it', parseInt(front) > 0 && parseInt(front) < 63, front);
  const ftChips = await sheet(page).locator('dl[data-rewound] dt small').evaluateAll((s) => s.filter((x) => getComputedStyle(x).display !== 'none').length);
  check(engine, 'full-time-only totals are flagged FT while rewound', ftChips === 4, `${ftChips} FT chips`);
  const future = await sheet(page).locator('li[data-future]').count();
  check(engine, 'later key moments dim', future > 0, `${future} dimmed`);
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'phone-scrubbed.png' });

  // Tap the second goal in Key moments.
  await sheet(page).locator('button[data-kind="goal"]').nth(1).scrollIntoViewIfNeeded();
  await sheet(page).locator('button[data-kind="goal"]').nth(1).click();
  await settle(page);
  const current = await sheet(page).locator('li[data-current]').textContent();
  check(engine, 'tapping a key moment jumps to it', (await headerScore(page)) === '2–0' && /2–0/.test(current), current.replace(/\s+/g, ' '));

  // Scroll until the strip docks, then scrub the docked copy.
  const scroller = sheet(page).locator(':scope > div[tabindex]');
  const sbox = await scroller.boundingBox();
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await scroller.evaluate((s) => (s.scrollTop = 0));
  // WebKit drops a wheel that lands right after a programmatic scroll; let the reset settle.
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 700);
  await settle(page, 700);
  check(engine, 'scrolling past the strip docks it', (await sheet(page).getAttribute('data-docked')) !== null);
  const dock = page.locator('[data-dock] [role="slider"]');
  check(engine, 'docked strip is interactive', !(await page.locator('[data-dock]').evaluate((d) => d.inert)));
  await dragOn(page, dock, 0.8, 0.2);
  await settle(page);
  check(engine, 'scrubbing the docked strip rewinds the score', (await headerScore(page)) === '0–0', `${await dock.getAttribute('aria-valuetext')}: ${await headerScore(page)}`);
  const mini = await page.locator('[data-match-sheet] [data-sheet-grab] p b').textContent();
  check(engine, 'the docked mini score follows', mini === '0–0', mini);
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'phone-docked.png' });
  await page.locator('[data-dock] button[aria-label="Back to full time"]').click();
  await settle(page, 1200);
  check(engine, 'FT in the dock returns to full time', (await headerScore(page)) === '2–0' && (await live(page)) === 0);
  // The dock is chrome outside the scroll area (like a navigation bar): scroll over the content.
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height * 0.75);
  await page.mouse.wheel(0, -2000);
  await settle(page, 600);
  check(engine, 'scrolling back up undocks', (await sheet(page).getAttribute('data-docked')) === null,
    `scrollTop ${await scroller.evaluate((s) => s.scrollTop)}`);

  // Keyboard on the strip.
  await strip.focus();
  await page.keyboard.press('Home');
  await settle(page, 1200);
  check(engine, 'Home on the strip goes to kick-off', (await strip.getAttribute('aria-valuetext')) === '1\'' || (await headerScore(page)) === '0–0', `${await strip.getAttribute('aria-valuetext')} ${await headerScore(page)}`);
  await page.keyboard.press('End');
  await settle(page, 1200);
  check(engine, 'End returns to full time', (await strip.getAttribute('aria-valuetext')) === 'Full time');

  // Close and give focus back.
  await page.keyboard.press('Escape');
  await settle(page, 700);
  const closed = await page.locator('[role="dialog"]').getAttribute('aria-hidden');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-match-opener'));
  check(engine, 'Escape closes the sheet and returns focus to the result', closed === 'true' && focused === '5704', `aria-hidden=${closed}, focus=${focused}`);

  // A result whose report has no events (the API's base plan): Barcelona in this scenario.
  await openFromCard(page, 81, 8104);
  await settle(page, 1200);
  const note = await sheet(page).innerText();
  check(engine, 'base-plan match keeps to the score with a note', /aren't available/.test(note) && (await sheet(page).locator('[role="slider"]').count()) === 0, (await sheet(page).locator('h2').textContent()));
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'phone-base-plan.png' });

  check(engine, 'no console errors on the phone flow', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function coverFlow(engine, browser) {
  const { context, page, errors } = await open(browser, BRANCH, COVER);
  check(engine, 'Duo cover keeps the phone layout', (await page.locator('[data-club-card]').count()) > 0);
  await openFromCard(page, 57, 5703);
  await settle(page, 1200);
  check(engine, 'Duo cover opens the sheet', (await sheet(page).locator('h2').textContent()) === 'Chelsea 2–0 Arsenal');
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'cover-sheet.png' });
  check(engine, 'no console errors on the cover display', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function wideFlow(engine, browser, viewport, name) {
  const { context, page, errors } = await open(browser, BRANCH, viewport);
  const row = page.locator('[data-match-opener="5704"]');
  check(engine, `${name}: Last 5 rows are buttons`, (await row.evaluate((b) => b.tagName)) === 'BUTTON');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/clubs/57/matches/5704'));
  await row.click();
  check(engine, `${name}: a Last 5 row opens the match`, (await response).status() === 200);
  await settle(page, 1200);
  const dialog = await page.locator('[role="dialog"]').boundingBox();
  check(engine, `${name}: the sheet uses the width`, dialog.width > 600, `${Math.round(dialog.width)}px of ${viewport.width}px`);
  const tops = await sheet(page).locator('section:not([aria-label])').evaluateAll((s) => s.map((x) => Math.round(x.getBoundingClientRect().top)));
  check(engine, `${name}: stats and key moments sit side by side`, tops.length === 2 && tops[0] === tops[1], tops.join(','));
  const strip = sheet(page).locator('[role="slider"]:not([data-compact])');
  await dragOn(page, strip, 0.95, 0.5);
  await settle(page);
  check(engine, `${name}: scrubbing works`, (await headerScore(page)) === '1–0');
  const overflow = await sheet(page).locator('dl').evaluate((card) => {
    const edge = card.getBoundingClientRect();
    return [...card.querySelectorAll('dd, dt, p span')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > edge.right - 4 || r.left < edge.left + 4;
    }).map((el) => el.textContent);
  });
  check(engine, `${name}: every stat value sits inside its card`, overflow.length === 0, overflow.join(', ') || 'all inside');
  if (engine === 'webkit') {
    await sheet(page).locator('section[aria-label="Replay"] button').click();
    await settle(page, 1200);
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({ path: OUT + `${name}-sheet.png` });
  }
  check(engine, `${name}: no console errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}

async function reducedFlow(engine, browser) {
  const { context, page, errors } = await open(browser, BRANCH, PHONE, { reduced: true });
  await openFromCard(page, 57, 5704);
  await settle(page, 1200);
  const strip = sheet(page).locator('[role="slider"]:not([data-compact])');
  await dragOn(page, strip, 0.95, 0.5);
  await settle(page);
  check(engine, 'reduced motion: scrubbing still works', (await headerScore(page)) === '1–0');
  const animations = await sheet(page).evaluate((s) => s.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  check(engine, 'reduced motion: no CSS animations run', animations === 0, `${animations} running`);
  check(engine, 'reduced motion: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function realApiFlow(engine, browser) {
  const { context, page, errors } = await open(browser, REAL, PHONE, { follows: '57' });

  const response = await openFromCard(page, 57, 560640);
  const body = await response.json();
  check(engine, 'real API: report arrives for Arsenal v Hull', response.status() === 200, `events=${body.events}, stats=${body.stats}, halfTime=${body.halfTime}`);
  await settle(page, 1500);
  const text = await sheet(page).innerText();
  check(engine, 'real API: free tier shows score, half time and referee, no strip',
    /Half time 0–0/.test(text) && /Ref Farai Hallam/.test(text) && (await sheet(page).locator('[role="slider"]').count()) === 0,
    (await sheet(page).locator('h2').textContent()));
  if (engine === 'webkit') await page.screenshot({ path: OUT + 'real-api-free-tier.png' });
  check(engine, 'real API: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// Existing screens should be pixel-identical to main: the change only adds behaviour to them.
async function parity(engine, browser) {
  const shots = [
    ['phone home', PHONE, async () => {}],
    ['phone picked result', PHONE, async (page) => {
      await page.locator('[data-fc][data-open] [data-pill]').nth(4).click();
      await settle(page);
    }],
    ['phone standings sheet', PHONE, async (page) => {
      await page.locator('main button:has(img[alt$="crest"])').first().click();
      await settle(page, 900);
    }],
    ['duo landscape club page', LAND, async () => {}],
    ['duo portrait club page', INNER, async () => {}],
  ];
  for (const [name, viewport, act] of shots) {
    const hashes = [];
    for (const base of [MAIN, BRANCH]) {
      const { context, page } = await open(browser, base, viewport, { follows: '57.81.5' });
      await act(page);
      const png = await page.screenshot();
      hashes.push(createHash('sha256').update(png).digest('hex').slice(0, 12));
      if (engine === 'webkit' && name === 'duo landscape club page') {
        await writeFile(OUT + `parity-${base === MAIN ? 'main' : 'branch'}-wide.png`, png);
      }
      await context.close();
    }
    check(engine, `parity with main: ${name}`, hashes[0] === hashes[1], hashes.join(' vs '));
  }
}

async function recordGif(browser) {
  const dir = OUT + 'video/';
  await mkdir(dir, { recursive: true });
  const { context, page } = await open(browser, BRANCH, PHONE, { video: dir });
  await openFromCard(page, 57, 5704);
  await settle(page, 1400);
  const strip = sheet(page).locator('[role="slider"]:not([data-compact])');
  await dragOn(page, strip, 0.97, 0.05, 60);
  await settle(page, 400);
  await dragOn(page, strip, 0.05, 0.6, 50);
  await settle(page, 700);
  await sheet(page).locator('button[data-kind="goal"]').nth(1).scrollIntoViewIfNeeded();
  await settle(page, 400);
  await sheet(page).locator('button[data-kind="goal"]').nth(1).click();
  await settle(page, 1000);
  const dock = page.locator('[data-dock] [role="slider"]');
  await dragOn(page, dock, 0.9, 0.3, 40);
  await settle(page, 700);
  await page.locator('[data-dock] button[aria-label="Back to full time"]').click();
  await settle(page, 1300);
  const video = page.video();
  await context.close();
  await video.saveAs(OUT + 'scrub.webm');
}

const engines = { chromium, webkit };
for (const [engine, launcher] of Object.entries(engines)) {
  const browser = await launcher.launch();
  try {
    await phoneFlow(engine, browser);
    await coverFlow(engine, browser);
    await wideFlow(engine, browser, LAND, 'duo-landscape');
    await wideFlow(engine, browser, INNER, 'duo-portrait');
    await reducedFlow(engine, browser);
    await realApiFlow(engine, browser);
    await parity(engine, browser);
  } finally {
    await browser.close();
  }
}
{
  const browser = await chromium.launch();
  try {
    await recordGif(browser);
  } finally {
    await browser.close();
  }
}

await writeFile(OUT + 'verification.json', JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
