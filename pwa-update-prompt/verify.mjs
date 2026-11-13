// Verifies the update prompt end to end: serve deploy v1, load the app, "deploy" v2 by
// restarting the server, bring the app back into view, then tap Update.
// Usage: node verify.mjs <repo> <outDir>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2]);
const out = resolve(process.argv[3] ?? '.');
mkdirSync(out, { recursive: true });
const { chromium, webkit } = createRequire(join(repo, 'package.json'))('playwright');
const PORT = 44321;
const ORIGIN = `http://localhost:${PORT}`;
const results = { headers: {}, browsers: {} };

let server = null;
async function deploy(version) {
  if (server) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill('SIGTERM');
    await exited;
  }
  server = spawn('node', ['--import', 'remix/node-tsx', 'server.ts'], {
    cwd: repo,
    env: { ...process.env, NODE_ENV: 'test', OTP_SCENARIO: 'matchday', PORT: String(PORT), APP_VERSION: version },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((ok, fail) => {
    server.stdout.on('data', (d) => String(d).includes('listening') && ok());
    server.once('exit', (code) => fail(new Error(`server exited ${code}`)));
  });
  console.log(`deployed ${version}`);
}

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const version = (page) => page.$eval('meta[name="otp-version"]', (m) => m.content);
const pill = (page) => page.locator('[data-update-prompt]');
// What an installed app sees when it is reopened from the home screen.
const resume = (page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function run(name, browserType, { gif = false } = {}) {
  await deploy('v1');
  const browser = await browserType.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    ...(name === 'chromium' ? { isMobile: true, hasTouch: true } : {}),
    ...(gif ? { recordVideo: { dir: join(out, 'video'), size: { width: 393, height: 852 } } } : {}),
  });
  const page = await context.newPage();
  const versionRequests = [];
  page.on('request', (r) => r.url().endsWith('/api/version') && versionRequests.push(r.url()));
  const r = {};

  await page.goto(ORIGIN);
  await page.waitForLoadState('networkidle');
  r.loadedVersion = await version(page);
  check(`${name}: page renders deploy v1`, r.loadedVersion === 'v1', r.loadedVersion);
  check(`${name}: checks the server on load`, versionRequests.length >= 1);
  await page.waitForTimeout(300);
  r.pillOnSameDeploy = await pill(page).count();
  check(`${name}: no prompt while the server runs the same deploy`, r.pillOnSameDeploy === 0);
  await page.screenshot({ path: join(out, `${name}-1-v1.png`) });

  await deploy('v2');
  await page.waitForTimeout(gif ? 600 : 0);
  // The minimum gap between checks is 10s; the page loaded well before the deploy finished.
  await page.waitForTimeout(10_500);
  await resume(page);
  await pill(page).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(700); // let the entrance settle
  r.pillText = (await pill(page).innerText()).replace(/\s+/g, ' ');
  check(`${name}: resume after a deploy shows the prompt`, true, r.pillText);
  r.pillBox = await pill(page).boundingBox();
  check(
    `${name}: prompt sits inside the viewport, centred at the top`,
    r.pillBox.y >= 0 && r.pillBox.y < 40 && Math.abs(r.pillBox.x + r.pillBox.width / 2 - 393 / 2) < 1,
    JSON.stringify(r.pillBox),
  );
  await page.screenshot({ path: join(out, `${name}-2-prompt.png`) });

  // Later hides it; reopening the app brings it back.
  await page.click('[data-update-later]');
  await page.waitForTimeout(gif ? 800 : 100);
  r.pillAfterLater = await pill(page).count();
  check(`${name}: Later hides the prompt`, r.pillAfterLater === 0);
  await page.waitForTimeout(10_500);
  await resume(page);
  await pill(page).waitFor({ state: 'visible', timeout: 5000 });
  check(`${name}: prompt returns next time the app is opened`, true);
  await page.waitForTimeout(gif ? 900 : 100);

  const responses = [];
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.pathname === '/' || url.pathname === '/assets/app/actions/public/entry.ts')
      responses.push({ path: url.pathname, status: res.status(), cacheControl: res.headers()['cache-control'] });
  });
  await page.evaluate(() => (window.__oldPage = true));
  await page.click('[data-update-now]');
  await page.waitForFunction(
    () => document.querySelector('meta[name="otp-version"]')?.content === 'v2' && !window.__oldPage,
    null,
    { timeout: 10_000 },
  );
  await page.waitForLoadState('networkidle');
  r.reloadedVersion = await version(page);
  check(`${name}: Update loads a fresh page from deploy v2`, r.reloadedVersion === 'v2', r.reloadedVersion);
  r.responsesOnUpdate = responses;
  check(
    `${name}: the page and its scripts came from the server again`,
    responses.some((x) => x.path === '/') && responses.some((x) => x.path.endsWith('entry.ts')),
    JSON.stringify(responses),
  );
  r.pillAfterUpdate = await pill(page).count();
  check(`${name}: no prompt once up to date`, r.pillAfterUpdate === 0);
  await page.screenshot({ path: join(out, `${name}-3-v2.png`) });
  await page.waitForTimeout(gif ? 800 : 0);

  // Control: why Update is a document link. The Remix runtime intercepts location.reload() and
  // re-renders in place, so the old page's scripts would keep running.
  await page.evaluate(() => (window.__marker = true));
  await page.evaluate(() => location.reload());
  await page.waitForTimeout(1500);
  r.locationReloadKeptOldScripts = await page.evaluate(() => window.__marker === true);
  check(
    `${name}: control — location.reload() keeps the old scripts running`,
    r.locationReloadKeptOldScripts,
  );

  const video = page.video();
  await context.close();
  await browser.close();
  if (video) r.video = await video.path();
  results.browsers[name] = r;
}

try {
  await deploy('v1');
  for (const path of ['/', '/api/version', '/manifest.webmanifest', '/assets/app/actions/public/entry.ts']) {
    const res = await fetch(ORIGIN + path);
    results.headers[path] = res.headers.get('cache-control');
    console.log(`${path} cache-control: ${results.headers[path]}`);
  }
  check('page revalidates', results.headers['/'] === 'no-cache');
  check('version endpoint never cached', results.headers['/api/version'] === 'no-store');
  check('static files revalidate', results.headers['/manifest.webmanifest'] === 'no-cache');

  await run('webkit', webkit);
  await run('chromium', chromium, { gif: true });
} finally {
  server?.kill('SIGTERM');
}
writeFileSync(join(out, 'verification.json'), JSON.stringify(results, null, 2));
