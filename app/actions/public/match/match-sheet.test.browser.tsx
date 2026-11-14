import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildClub, buildClubMatches, buildLineups, buildMatchDetail, buildMatches, buildTeam } from '../../../fixtures/builders.ts';
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

// A first half Arsenal had on top, then a spell for Liverpool after the break.
const momentum = Array.from({ length: 91 }, (_, minute) => ({
  minute,
  value: minute === 0 ? 0 : minute <= 45 ? 50 : minute <= 70 ? -40 : 20,
}));

function mount({ events = true, withMomentum = false, withLineups = false, width = 390 } = {}) {
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'relative', display: 'flex', flexDirection: 'column', width: `${width}px`, height: '640px',
  });
  for (const [token, value] of Object.entries(tokens)) container.style.setProperty(token, value);
  document.body.append(container);

  const requests: string[] = [];
  const detail = buildMatchDetail(recent.matches[0]!, { events, stats: events, odds: events });
  const base = toMatchReport(detail, NOW)!;
  const report = {
    ...base,
    ...(withMomentum ? { momentum } : {}),
    ...(withLineups ? { lineups: buildLineups(detail), bestPlayer: 5709 } : {}),
  };
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

  it('shades who was ahead when there is no momentum', async () => {
    const { container } = mount();
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    const strip = container.querySelector('[role="slider"]:not([data-compact])')!;
    assert.equal(strip.hasAttribute('data-momentum'), false);
    assert.ok(strip.querySelector('rect[data-side]'), 'lead bands are drawn');
    assert.equal(strip.querySelector('path[data-side]'), null);
    assert.ok(!container.textContent!.includes('Time on top'));
  });

  it('draws momentum on both strips and rewinds the time on top', async () => {
    const { container } = mount({ withMomentum: true });
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    for (const strip of container.querySelectorAll('[role="slider"]')) {
      assert.ok(strip.hasAttribute('data-momentum'));
      assert.equal(strip.querySelector('rect[data-side]'), null, 'no lead bands under momentum');
      // Played and unplayed copies, each split into a home half and an away half.
      assert.equal(strip.querySelectorAll('path[data-side="home"]').length, 2);
      assert.equal(strip.querySelectorAll('path[data-side="away"]').length, 2);
    }
    assert.match(container.querySelector('section[aria-label="Replay"]')!.textContent!, /Momentum, minute by minute/);

    const onTop = () =>
      [...container.querySelectorAll('dl > div')]
        .find((row) => row.textContent!.includes('Time on top'))
        ?.querySelectorAll('dd');
    await until(() => !!onTop(), 'the time on top row appears');
    // The clock runs 0–47 then 47–96: Arsenal 0–45 and 72–92; Liverpool from 45 (the momentum
    // has no added-time points, so the stoppage goes to the next minute's value) to 72.
    assert.deepEqual([...onTop()!].map((dd) => dd.textContent), ['65′', '27′']);
    const end = Number(container.querySelector('[role="slider"]')!.getAttribute('aria-valuemax'));

    const strip = container.querySelector<HTMLElement>('[role="slider"]:not([data-compact])')!;
    tap(strip, 30 / end);
    await until(() => onTop()![1]!.textContent === '0′' && onTop()![0]!.textContent === '30′', 'time on top rewinds to 30′');
  });

  it('keeps to the score when the plan has no events', async () => {
    const { container, text } = mount({ events: false });
    await until(() => text('[data-match-sheet]').includes("aren't available"), 'the note appears');
    assert.equal(container.querySelector('[role="slider"]'), null);
    assert.equal(score(container), '2–1');
  });

  it('has no lineups section when the report has no lineups', async () => {
    const { container } = mount();
    await until(() => !!container.querySelector('[role="slider"]'), 'the replay strip appears');
    assert.equal(container.querySelector('[data-lineups]'), null);
  });
});

describe('match sheet lineups', () => {
  const lineups = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-lineups]');
  const tabs = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[data-lineups] [role="tab"]')];
  const pages = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-lineups] [role="tabpanel"]')];

  it("opens on the club's own XI, then switches to the other side", async () => {
    const { container } = mount({ withLineups: true });
    await until(() => !!lineups(container), 'the lineups appear');
    assert.deepEqual(tabs(container).map((t) => t.getAttribute('aria-selected')), ['true', 'false']);
    const [ours, theirs] = pages(container);
    assert.equal(ours!.querySelectorAll('[data-player][style*="left"]').length, 11, 'eleven on the pitch');
    assert.match(ours!.textContent!, /4-3-3 · Starting XI/);
    assert.equal(ours!.inert, false);
    assert.equal(theirs!.inert, true);

    tabs(container)[1]!.click();
    await until(() => tabs(container)[1]!.getAttribute('aria-selected') === 'true', 'the second tab is selected');
    assert.equal(pages(container)[0]!.inert, true);
    assert.equal(pages(container)[1]!.inert, false);
    // The track slides one page over.
    const track = lineups(container)!.querySelector<HTMLElement>('[data-track]')!;
    const view = lineups(container)!.querySelector<HTMLElement>('[data-view]')!;
    await until(() => Math.abs(new DOMMatrix(getComputedStyle(track).transform).m41 + view.clientWidth) < 1, 'the track lands on the second page');
  });

  it('lists the bench with who each substitute replaced', async () => {
    const { container } = mount({ withLineups: true });
    await until(() => !!lineups(container), 'the lineups appear');
    const bench = [...pages(container)[0]!.querySelectorAll('ol button')].map((b) => b.textContent!.replace(/\s+/g, ' '));
    assert.equal(bench.length, 2);
    assert.match(bench[0]!, /62'.*for Fischer/);
    assert.equal(pages(container)[0]!.querySelectorAll('[data-chips] button').length, 5, 'unused substitutes');
  });

  it('opens a player card from the pitch, and its events jump the replay', async () => {
    const { container } = mount({ withLineups: true });
    await until(() => !!lineups(container), 'the lineups appear');
    const scorer = pages(container)[0]!.querySelector<HTMLButtonElement>('[data-player="5709"]')!;
    scorer.click();
    const peek = () => container.querySelector<HTMLElement>('[data-peek]');
    await until(() => !!peek(), 'the player card opens');
    assert.match(peek()!.textContent!, /Player of the match/);
    assert.ok(scorer.hasAttribute('data-selected'));

    const goal = peek()!.querySelector<HTMLButtonElement>('button[data-kind="goal"]')!;
    assert.match(goal.textContent!, /25'/);
    goal.click();
    await until(() => score(container) === '1–0', 'the replay rewinds to the goal');

    scorer.click();
    await until(() => !peek(), 'pressing the player again closes the card');
  });

  it('stands the two halves side by side on a wide sheet', async () => {
    const { container } = mount({ withLineups: true, width: 760 });
    await until(() => !!lineups(container), 'the lineups appear');
    await until(() => pages(container).every((p) => !p.inert), 'both halves are live');
    assert.equal(getComputedStyle(container.querySelector('[data-lineups] [role="tablist"]')!).display, 'none');
    const [a, b] = pages(container).map((p) => p.getBoundingClientRect());
    assert.ok(b!.left >= a!.right, 'the second half sits beside the first');
    assert.equal(Math.round(a!.top), Math.round(b!.top));
  });
});
