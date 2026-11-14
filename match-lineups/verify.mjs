// End-to-end check of the lineups on the match sheet, against the running app on :44200 (this
// branch, real football-data + FotMob). Chromium uses real touch (CDP touch events) for swipes;
// WebKit uses the mouse. Writes stills and a video to OUT.
import { chromium, webkit } from '/Users/joserodriguez/.t3/worktrees/otp/t3-3af55471-6cad289db123f665/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:44200';
const OUT = process.argv[2];
mkdirSync(`${OUT}/video`, { recursive: true });
const SIZES = { phone: [402, 874], cover: [382, 618], inner: [669, 902], landscape: [951, 620] };
const results = [];
const check = (engine, name, ok, detail = '') => {
  results.push({ engine, name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '✓' : '✗'} [${engine}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const finger = () => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.28);box-shadow:0 0 0 1.5px rgba(255,255,255,.7);pointer-events:none;opacity:0;transform:scale(.6);transition:opacity 120ms,transform 120ms;left:-99px;top:-99px';
    document.body.append(dot);
    addEventListener('pointermove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('pointerdown', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; dot.style.opacity = 1; dot.style.transform = 'scale(1)'; }, true);
    addEventListener('pointerup', () => { dot.style.opacity = 0; dot.style.transform = 'scale(.6)'; }, true);
    addEventListener('pointercancel', () => { dot.style.opacity = 0; }, true);
  });
};

async function open(browserType, size, { video = false, follows = '81' } = {}) {
  const [width, height] = SIZES[size];
  const browser = await browserType.launch();
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark',
    ...(video ? { recordVideo: { dir: `${OUT}/video`, size: { width: width * 2, height: height * 2 } } } : {}),
  });
  await context.addCookies([{ name: 'otp_follows', value: follows, domain: 'localhost', path: '/' }]);
  if (video) await context.addInitScript(finger);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/images\.fotmob\.com/.test(m.location().url ?? '') && errors.push(m.text()));
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName('otp:hydrated').length > 0);
  await page.waitForTimeout(1000);
  return { browser, context, page, errors, width, height };
}

const pause = (page, ms) => page.waitForTimeout(ms);
const sheet = (page) => page.locator('[data-match-sheet]');
const lineups = (page) => page.locator('[data-lineups]');
const score = (page) => sheet(page).locator('header p').nth(1).evaluate((p) => p.textContent.replace(/\s/g, ''));
const selected = (page) => lineups(page).locator('[role="tab"][aria-selected="true"]').innerText();

async function openMatch(page, matchId, wide) {
  if (!wide) {
    const item = page.locator('[data-fc]', { has: page.locator(`[data-match-opener="${matchId}"]`) });
    if ((await item.getAttribute('data-open')) === null) {
      await item.locator('button[aria-expanded]').click();
      await pause(page, 900);
    }
    const ids = await item.locator('[data-match-opener]').evaluateAll((b) => b.map((x) => x.dataset.matchOpener));
    await item.locator('[data-pill]').nth(ids.indexOf(String(matchId))).click();
    await pause(page, 700);
  }
  await page.locator(`[data-match-opener="${matchId}"]`).click();
  await page.waitForSelector('[data-lineups]', { timeout: 20000 });
  await page.evaluate(() => Promise.all([...document.querySelectorAll('[data-lineups] img')].map((i) => i.complete || new Promise((r) => { i.onload = i.onerror = r; }))));
  await pause(page, 700);
}

async function scrollToLineups(page, offset = 70) {
  await page.evaluate((offset) => {
    const el = document.querySelector('[data-lineups]');
    let s = el.parentElement;
    while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
    const top = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - offset;
    s.scrollTo({ top, behavior: 'smooth' });
  }, offset);
  await pause(page, 900);
}

async function touchDrag(page, cdp, from, to, steps = 14) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await pause(page, 16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mouseDrag(page, from, to, steps = 14) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await pause(page, 16);
  }
  await page.mouse.up();
}
async function tap(page, locator, cdp) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 20);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await pause(page, 90);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.down();
    await pause(page, 90);
    await page.mouse.up();
  }
}

// Name tags that overlap on the pitch, per page.
const overlaps = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-lineups] [role="tabpanel"]')].map((panel) => {
      const tags = [...panel.querySelectorAll('[data-player] [data-name]')].map((n) => [n.textContent, n.getBoundingClientRect()]);
      const hits = [];
      for (let i = 0; i < tags.length; i++)
        for (let j = i + 1; j < tags.length; j++) {
          const [a, ra] = tags[i];
          const [b, rb] = tags[j];
          if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) hits.push(`${a}/${b}`);
        }
      const pitch = panel.querySelector('[style*="aspect-ratio"]').getBoundingClientRect();
      const outside = [...panel.querySelectorAll('[data-player] [data-face]')].filter((f) => {
        const r = f.getBoundingClientRect();
        return r.left < pitch.left - 2 || r.right > pitch.right + 2 || r.top < pitch.top - 2 || r.bottom > pitch.bottom + 2;
      }).length;
      return { hits, outside, truncated: tags.filter(([, r], i) => panel.querySelectorAll('[data-player] [data-name]')[i].scrollWidth > r.width + 1).map(([t]) => t) };
    }),
  );

// ── phone: the main flow ──
async function phoneFlow(engineName, browserType) {
  const isChromium = engineName === 'chromium';
  const { browser, context, page, errors, width } = await open(browserType, 'phone', { video: isChromium });
  const cdp = isChromium ? await context.newCDPSession(page) : null;
  await openMatch(page, 564723, false);
  check(engineName, 'the sheet opens on Barcelona 1–2 Real Madrid', (await sheet(page).locator('h2').textContent()).includes('1–2'));
  await scrollToLineups(page);
  check(engineName, 'Barcelona (the followed club) shows first', (await selected(page)).includes('FCB'), await selected(page));
  const first = lineups(page).locator('[role="tabpanel"]').first();
  const onPitch = await first.locator('[data-player][style*="left"]').count();
  check(engineName, 'eleven players on the pitch', onPitch === 11, onPitch);
  const photos = await first.locator('[data-face] img').evaluateAll((imgs) => imgs.filter((i) => i.naturalWidth > 0 && i.style.display !== 'none').length);
  check(engineName, 'player photos load', photos >= 9, `${photos}/11`);
  check(engineName, 'formation and Starting XI', /\d-\d.*Starting XI/.test(await first.innerText()));
  if (!isChromium) await page.screenshot({ path: `${OUT}/phone-ours.png` });

  // A vertical drag on the pitch still scrolls the sheet (touch only: the mouse can't scroll).
  const pitch = first.locator('[style*="aspect-ratio"]');
  const box = await pitch.boundingBox();
  if (cdp) {
    const scrollTop = () => page.evaluate(() => {
      let s = document.querySelector('[data-lineups]').parentElement;
      while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
      return s.scrollTop;
    });
    const before = await scrollTop();
    await touchDrag(page, cdp, [box.x + box.width * 0.3, box.y + box.height * 0.7], [box.x + box.width * 0.33, box.y + box.height * 0.35]);
    await pause(page, 700);
    const after = await scrollTop();
    check(engineName, 'a vertical drag on the pitch scrolls the sheet', after > before + 60, `${before} → ${after}`);
    check(engineName, 'and does not switch teams', (await selected(page)).includes('FCB'));
    await scrollToLineups(page);
  }

  // Swipe left: Real Madrid.
  const b2 = await pitch.boundingBox();
  const y = b2.y + b2.height * 0.45;
  if (cdp) await touchDrag(page, cdp, [b2.x + b2.width * 0.85, y], [b2.x + b2.width * 0.2, y]);
  else await mouseDrag(page, [b2.x + b2.width * 0.85, y], [b2.x + b2.width * 0.2, y]);
  await pause(page, 800);
  check(engineName, 'a swipe moves to Real Madrid', (await selected(page)).includes('RMA'), await selected(page));
  check(engineName, 'the swipe opened no player card', (await page.locator('[data-peek]').count()) === 0);
  const offset = await lineups(page).locator('[data-track]').evaluate((t) => new DOMMatrix(getComputedStyle(t).transform).m41);
  const viewWidth = await lineups(page).locator('[data-view]').evaluate((v) => v.clientWidth);
  check(engineName, 'the track lands exactly one page over', Math.abs(offset + viewWidth) < 1, `${offset} vs ${-viewWidth}`);
  const highlight = await lineups(page).locator('[data-highlight]').evaluate((h) => new DOMMatrix(getComputedStyle(h).transform).m41);
  const hlWidth = await lineups(page).locator('[data-highlight]').evaluate((h) => h.offsetWidth);
  check(engineName, 'the switch highlight followed', Math.abs(highlight - hlWidth) < 1, `${highlight} vs ${hlWidth}`);
  if (!isChromium) await page.screenshot({ path: `${OUT}/phone-theirs.png` });

  // Rubber band past the last page, then it springs back.
  const b3 = await pitch.boundingBox();
  if (cdp) await touchDrag(page, cdp, [b3.x + b3.width * 0.8, y], [b3.x + b3.width * 0.2, y]);
  else await mouseDrag(page, [b3.x + b3.width * 0.8, y], [b3.x + b3.width * 0.2, y]);
  await pause(page, 800);
  check(engineName, 'pulling past the last team springs back', (await selected(page)).includes('RMA'));

  // Tap the scorer of the winner: the card opens; its goal jumps the replay.
  const scorer = lineups(page).locator('[role="tabpanel"]').nth(1).locator('[data-player][style*="left"]').filter({ has: page.locator('[data-glyph="goal"]') }).first();
  const scorerName = await scorer.getAttribute('aria-label');
  await tap(page, scorer, cdp);
  await pause(page, 500);
  const peek = page.locator('[data-peek][data-in]');
  check(engineName, 'pressing a player opens their card', (await peek.count()) === 1, scorerName);
  const peekText = await peek.innerText().catch(() => '');
  check(engineName, 'the card has rating, minutes and a goal', /\d\.\d/.test(peekText) && /played|Off|On/.test(peekText) && /Goal|Penalty/.test(peekText), peekText.replace(/\n+/g, ' | '));
  const inView = await peek.evaluate((p) => {
    const r = p.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  });
  check(engineName, 'the card sits fully on screen', inView);
  if (!isChromium) await page.screenshot({ path: `${OUT}/phone-peek.png` });
  const goal = peek.locator('button[data-kind="goal"]').first();
  const goalLabel = await goal.locator('span').innerText();
  await tap(page, goal, cdp);
  await pause(page, 900);
  const rewound = await score(page);
  const clock = await sheet(page).locator('header [data-live]').innerText().catch(() => '');
  check(engineName, 'the goal jumps the replay there', clock.replace(/\s/g, '') === goalLabel.replace(/\s/g, ''), `${goalLabel} → clock ${clock}, score ${rewound}`);
  if (!isChromium) await page.screenshot({ path: `${OUT}/phone-jumped.png` });

  // Pressing elsewhere closes the card.
  await tap(page, lineups(page).locator('h3'), cdp);
  await pause(page, 400);
  check(engineName, 'pressing elsewhere closes the card', (await page.locator('[data-peek]').count()) === 0);

  // A bench row opens the substitute's card, then Escape closes it.
  const benchRow = lineups(page).locator('[role="tabpanel"]').nth(1).locator('ol button[data-player]').first();
  await benchRow.scrollIntoViewIfNeeded();
  await pause(page, 300);
  await tap(page, benchRow, cdp);
  await pause(page, 500);
  const subText = await page.locator('[data-peek][data-in]').innerText().catch(() => '');
  check(engineName, 'a bench row opens the substitute', /Substitute/.test(subText) && /On for/.test(subText), subText.replace(/\n+/g, ' | '));
  if (!isChromium) await page.screenshot({ path: `${OUT}/phone-bench-peek.png` });
  await page.keyboard.press('Escape');
  await pause(page, 400);
  check(engineName, 'Escape closes the card, not the sheet', (await page.locator('[data-peek]').count()) === 0 && (await sheet(page).count()) === 1);

  // The tab switches back.
  await tap(page, lineups(page).locator('[role="tab"]').first(), cdp);
  await pause(page, 700);
  check(engineName, 'tapping the switch goes back', (await selected(page)).includes('FCB'));

  check(engineName, 'no console errors (phone)', errors.length === 0, errors.join(' | '));
  await context.close();
  await browser.close();
}

// ── every size, every Barça result: layout ──
async function layoutFlow(engineName, browserType) {
  for (const size of ['cover', 'phone', 'inner', 'landscape']) {
    const wide = size === 'inner' || size === 'landscape';
    const { browser, context, page, errors } = await open(browserType, size);
    for (const matchId of [575367, 564723, 564732, 575380, 564746]) {
      await openMatch(page, matchId, wide);
      const title = (await sheet(page).locator('h2').textContent()).trim();
      const sideBySide = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('[data-lineups] [role="tabpanel"]')];
        const [a, b] = panels.map((p) => p.getBoundingClientRect());
        return { both: panels.every((p) => !p.inert), beside: b.left >= a.right - 1 && Math.abs(a.top - b.top) < 1 };
      });
      const expectWide = size === 'inner' || size === 'landscape';
      check(engineName, `${size} ${title}: ${expectWide ? 'halves side by side' : 'one half at a time'}`, expectWide ? sideBySide.both && sideBySide.beside : !sideBySide.both, JSON.stringify(sideBySide));
      const o = await overlaps(page);
      check(engineName, `${size} ${title}: no name tags collide, nobody off the pitch`, o.every((p) => !p.hits.length && !p.outside), JSON.stringify(o));
      // Everything in a live half stays inside that half (the off-screen half is the pager's).
      const spill = await page.evaluate(() =>
        [...document.querySelectorAll('[data-lineups] [role="tabpanel"]')].filter((p) => !p.inert).flatMap((panel) => {
          const box = panel.getBoundingClientRect();
          // Event glyphs on a flank player may lean into the gap between halves, never past it.
          const gap = 20;
          return [...panel.querySelectorAll('*')].filter((el) => {
            const r = el.getBoundingClientRect();
            const slack = el.closest('[data-glyphs]') ? gap : 1;
            return r.width && (r.left < box.left - slack || r.right > box.right + slack);
          }).map((el) => el.textContent.slice(0, 20) || el.tagName);
        }),
      );
      check(engineName, `${size} ${title}: nothing spills past its half`, spill.length === 0, spill.join(' | '));
      if (engineName === 'webkit' && matchId === 564723) {
        await scrollToLineups(page, size === 'landscape' ? 90 : 70);
        await page.screenshot({ path: `${OUT}/${size}.png` });
      }
      await page.locator('[data-match-sheet] button', { hasText: 'Done' }).click();
      await pause(page, 700);
    }
    check(engineName, `no console errors (${size})`, errors.length === 0, errors.join(' | '));
    await context.close();
    await browser.close();
  }
}

const engines = process.argv[3] ? process.argv[3].split(',') : ['chromium', 'webkit'];
for (const name of engines) {
  const type = name === 'chromium' ? chromium : webkit;
  await phoneFlow(name, type);
  await layoutFlow(name, type);
}
writeFileSync(`${OUT}/verification.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass`);
process.exit(failed.length ? 1 : 0);
