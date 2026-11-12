import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { NOW, buildClub, buildClubMatches } from '../../../fixtures/builders.ts';
import { tokens } from '../../../ui/theme.ts';
import { ClubCard } from './club-card.tsx';

function mount(fixtures: number[] = [2, 9]) {
  // Apply layout before mounting: wireTimeline measures the card in its ref callback.
  const container = document.createElement('div');
  container.style.width = '390px';
  for (const [token, value] of Object.entries(tokens)) container.style.setProperty(token, value);
  document.body.append(container);
  const view = render(
    <ClubCard
      club={buildClub({ name: 'Arsenal' })}
      matches={buildClubMatches({ now: NOW, form: 'WDLWW', fixtures })}
      clock={{ now: NOW, timeZone: 'UTC' }}
    />,
    { container },
  );
  function required(selector: string, root: ParentNode = container): HTMLElement {
    const node = root.querySelector<HTMLElement>(selector);
    assert.ok(node, `ClubCard must render Timeline hook ${selector}`);
    return node;
  }
  const card = required('[data-club-card]');
  const form = required('[data-form]');
  const lens = required('[data-lens]', form);
  required('[data-pills]', form);
  const pager = required('[data-pager]');
  const track = required('[data-track]', pager);
  const pills = [...form.querySelectorAll<HTMLElement>('[data-pill]')];
  const pages = [...track.children] as HTMLElement[];
  return { ...view, card, form, lens, pager, track, pills, pages };
}
type View = ReturnType<typeof mount>;
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function until(check: () => boolean, message: string, timeout = 3000) {
  const start = performance.now();
  while (!check()) {
    assert.ok(performance.now() - start < timeout, message);
    await frame();
  }
}

function pointer(target: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, isPrimary: true, pointerId: 1,
    pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x, clientY: target.getBoundingClientRect().top + 10,
  }));
}
const center = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2;
};

async function settled(view: View, index: number) {
  await until(() => {
    const page = view.pages[index]!.getBoundingClientRect();
    const viewport = view.pager.getBoundingClientRect();
    const lens = view.lens.getBoundingClientRect();
    const pill = view.pills[Math.min(index, 5)]!.getBoundingClientRect();
    return Math.abs(page.left - viewport.left) < 0.05
      && Math.abs(lens.left + lens.width / 2 - pill.left - pill.width / 2) < 0.75;
  }, `pager and lens should settle at Timeline position ${index}`);
}
function position(view: View, index: number) {
  assert.deepEqual(view.pills.map((pill) => pill.hasAttribute('data-lit')),
    view.pills.map((_, i) => i === Math.min(index, 5)), 'exactly the matching pill is lit');
  assert.deepEqual(view.pages.map((page) => page.inert),
    view.pages.map((_, i) => i !== index), 'only the selected page is interactive');
  assert.equal(view.card.hasAttribute('data-now'), index === 5);
  assert.ok(view.pages[index]!.getBoundingClientRect().width > 0);
}
async function scrub(view: View, index: number) {
  const x = center(view.pills[index]!);
  pointer(view.form, 'pointerdown', center(view.pills[index === 5 ? 0 : 5]!));
  pointer(view.form, 'pointermove', x);
  assert.ok(view.card.hasAttribute('data-scrubbing'), 'horizontal movement activates scrubbing');
  pointer(view.form, 'pointerup', x);
  await settled(view, index);
}
async function swipe(view: View, direction: 1 | -1) {
  const rect = view.pager.getBoundingClientRect();
  const start = rect.left + (direction === 1 ? 30 : rect.width - 30);
  pointer(view.pager, 'pointerdown', start);
  // The first 6px claims the gesture and resets its origin.
  pointer(view.pager, 'pointermove', start + direction * 10);
  const end = start + direction * (10 + rect.width * 0.7);
  pointer(view.pager, 'pointermove', end);
  // The velocity tracker discards a release more than 60ms after the last move.
  // Hold at the destination so this tests displacement rather than a variable fling.
  const held = performance.now();
  await until(() => performance.now() - held > 65, 'pointer hold should pass the velocity window');
  pointer(view.pager, 'pointerup', end);
}

describe('club card Timeline', () => {
  it('renders the required hooks and starts on Next with the next match visible', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    assert.deepEqual(view.pills.map((pill) => pill.textContent), ['W', 'D', 'L', 'W', 'W', 'Next']);
    assert.equal(view.pages.length, 7, 'one page per result and fixture');
    assert.equal(view.card.querySelectorAll('[data-dot]').length, 2);
    await frame();
    await settled(view, 5);
    position(view, 5);
    assert.match(view.pages[5]!.textContent!, /2d.*Next · Tue 12:00.*vs Chelsea/);
  });

  it('scrubs to a result and keeps its pill, lens and page picked after release', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    const x = center(view.pills[2]!);
    pointer(view.form, 'pointerdown', center(view.pills[5]!));
    pointer(view.form, 'pointermove', x);
    position(view, 2);
    assert.ok(view.card.hasAttribute('data-picked'));
    assert.ok(view.card.hasAttribute('data-scrubbing'));
    pointer(view.form, 'pointerup', x);
    await settled(view, 2);
    position(view, 2);
    assert.equal(view.card.hasAttribute('data-scrubbing'), false);
    assert.ok(view.card.hasAttribute('data-picked'));
    assert.match(view.pages[2]!.textContent!, /0–2.*Lost.*vs Chelsea/);
  });

  it('activates a held pointer and scrubs back to the Next match', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    const x = center(view.pills[0]!);
    pointer(view.form, 'pointerdown', x);
    await until(() => view.card.hasAttribute('data-scrubbing'), '110ms hold activates scrub');
    position(view, 0);
    assert.match(view.pages[0]!.textContent!, /2–0.*Won/);
    pointer(view.form, 'pointermove', center(view.pills[5]!));
    pointer(view.form, 'pointerup', center(view.pills[5]!));
    await settled(view, 5);
    position(view, 5);
    assert.match(view.pages[5]!.textContent!, /Next · Tue 12:00.*vs Chelsea/);
  });

  it('swipes to a result and back to Next with strip, lens and pager agreeing', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    await swipe(view, 1);
    await settled(view, 4);
    position(view, 4);
    assert.ok(view.card.hasAttribute('data-picked'));
    assert.match(view.pages[4]!.textContent!, /2–0.*Won/);
    await swipe(view, -1);
    await settled(view, 5);
    position(view, 5);
    assert.match(view.pages[5]!.textContent!, /Next · Tue 12:00.*vs Chelsea/);
  });

  it('shows No upcoming matches on Next when there are no fixtures', async (t) => {
    const view = mount([]);
    t.after(view.cleanup);
    await scrub(view, 1);
    position(view, 1);
    await scrub(view, 5);
    position(view, 5);
    assert.equal(view.pages[5]!.textContent, 'NextNo upcoming matches');
  });

  it('rests the lens on Next, and a Picked result is a lit result slot', async (t) => {
    const view = mount();
    t.after(view.cleanup);
    // data-picked means the lens is showing. On Next it rests as a ring (data-now), as in the
    // prototype, so a Picked result is data-picked without data-now.
    await scrub(view, 2);
    assert.ok(view.card.hasAttribute('data-picked'));
    assert.equal(view.card.hasAttribute('data-now'), false);
    await scrub(view, 5);
    assert.ok(view.card.hasAttribute('data-picked'));
    assert.ok(view.card.hasAttribute('data-now'));
  });
});
