import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildClub, buildClubMatches, buildMatchDetail, buildMatches, buildTeam } from '../../../fixtures/builders.ts';
import { toMatchReport } from '../../../lib/match-report.ts';
import { tokens } from '../../../ui/theme.ts';
import { MatchSheet } from './match-sheet.tsx';
import { MatchReportsModel } from './reports.ts';

// Arsenal beat Liverpool 2–1 at home: goals interleave 1–0, 1–1, 2–1.
const arsenal = buildTeam({ id: 57, shortName: 'Arsenal' });
const liverpool = buildTeam({ id: 64, shortName: 'Liverpool' });
const recent = buildMatches({
  club: arsenal,
  results: [{ result: 'W', score: [2, 1], opponent: liverpool, overrides: { id: 9000 } }],
});

function mount({ events = true } = {}) {
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'relative', display: 'flex', flexDirection: 'column', width: '390px', height: '640px',
  });
  for (const [token, value] of Object.entries(tokens)) container.style.setProperty(token, value);
  document.body.append(container);

  const requests: string[] = [];
  const report = toMatchReport(buildMatchDetail(recent.matches[0]!, { events, stats: events, odds: events }), NOW)!;
  const reports = new MatchReportsModel({
    now: () => NOW,
    fetch: async (url) => {
      requests.push(String(url));
      return Response.json(report);
    },
  });
  const match = buildClubMatches({ club: arsenal, matches: recent.matches }).form[0]!;
  const view = render(
    <MatchSheet
      club={buildClub({ id: 57, name: 'Arsenal' })}
      match={match}
      reports={reports}
      clock={{ now: NOW, timeZone: 'UTC' }}
      titleId='match-title'
      onClose={() => {}}
    />,
    { container },
  );
  const text = (selector: string) => container.querySelector(selector)?.textContent ?? '';
  return { ...view, container, requests, report, text };
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function until(check: () => boolean, message: string, timeout = 3000) {
  const start = performance.now();
  while (!check()) {
    assert.ok(performance.now() - start < timeout, message);
    await frame();
  }
}

function tap(target: HTMLElement, fraction: number) {
  const rect = target.getBoundingClientRect();
  const init = {
    bubbles: true, cancelable: true, isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0,
    clientX: rect.left + rect.width * fraction, clientY: rect.top + rect.height / 2,
  };
  target.dispatchEvent(new PointerEvent('pointerdown', init));
  target.dispatchEvent(new PointerEvent('pointerup', init));
}

const score = (container: HTMLElement) =>
  [...container.querySelectorAll('header p')][1]?.textContent?.replace(/\s/g, '');

describe('match sheet', () => {
  it('shows the result straight away, then the replay once the report arrives', async () => {
    const { container, requests, text } = mount();
    assert.equal(text('h2'), 'Arsenal 2–1 Liverpool');
    assert.deepEqual(requests, ['/api/clubs/57/matches/9000']);
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    assert.equal(score(container), '2–1');
    assert.match(text('section[aria-label="Replay"]'), /Arsenal led for \d+ of \d+ minutes/);
  });

  it('rewinds the score, clock and moments when the strip is scrubbed, and returns at full time', async () => {
    const { container, report } = mount();
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    const strip = container.querySelector<HTMLElement>('[role="slider"]:not([data-compact])')!;

    // Halfway through: past the first goal (1–0), before the equaliser.
    const firstGoal = report.events!.find((e) => e.kind === 'goal')!;
    tap(strip, (firstGoal.minute + 3) / 94);
    await until(() => score(container) === '1–0', 'the header score rewinds to 1–0');
    assert.ok(container.querySelector('[data-live]'), 'the clock shows the minute, not full time');
    assert.ok(container.querySelectorAll('li[data-future]').length > 0, 'later moments dim');

    container.querySelector<HTMLButtonElement>('section[aria-label="Replay"] button')!.click();
    await until(() => !container.querySelector('[data-live]'), 'the clock settles back on full time');
    assert.equal(score(container), '2–1');
  });

  it('jumps to a key moment when it is tapped', async () => {
    const { container } = mount();
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    const goals = [...container.querySelectorAll<HTMLButtonElement>('button[data-kind="goal"]')];
    goals[1]!.click();
    const current = () => container.querySelector('li[data-current] button[data-kind="goal"]');
    await until(() => !!current()?.textContent?.includes('1–1'), 'the tapped goal becomes the current moment');
    assert.equal(score(container), '1–1');
  });

  it('docks a compact strip once the replay scrolls under the top edge', async () => {
    const { container } = mount();
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    const root = container.querySelector('[data-match-sheet]')!;
    const scroller = container.querySelector<HTMLElement>('[data-match-sheet] > div[tabindex]')!;
    assert.equal(root.hasAttribute('data-docked'), false);
    scroller.scrollTop = scroller.scrollHeight;
    await until(() => root.hasAttribute('data-docked'), 'the strip docks');
    assert.equal(container.querySelector<HTMLElement>('[data-dock]')!.inert, false);
  });

  it('keeps to the score when the plan has no events', async () => {
    const { container, text } = mount({ events: false });
    await until(() => text('[data-match-sheet]').includes("aren't available"), 'the note appears');
    assert.equal(container.querySelector('[role="slider"]'), null);
    assert.equal(score(container), '2–1');
  });
});
