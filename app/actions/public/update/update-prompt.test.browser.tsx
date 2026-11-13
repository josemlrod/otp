import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { describe, it } from 'remix/test';

import { tokens } from '../../../ui/theme.ts';
import { UpdatePill } from './update-prompt.tsx';
import { VersionWatch } from './version-watch.ts';

function mount(answers: string[]) {
  let calls = 0;
  const watch = new VersionWatch({
    current: 'a',
    fetchVersion: async () => answers[Math.min(calls++, answers.length - 1)]!,
    minGap: 0,
  });
  const view = render(<UpdatePill watch={watch} />);
  for (const [token, value] of Object.entries(tokens)) view.container.style.setProperty(token, value);
  // Keep the test page in place; record where Update would have taken it.
  const navigations: string[] = [];
  view.container.addEventListener('click', (event) => {
    const link = (event.target as Element).closest('a');
    if (!link) return;
    event.preventDefault();
    navigations.push(link.getAttribute('href')!);
  });
  return { ...view, watch, navigations, calls: () => calls };
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function until(check: () => boolean, message: string, timeout = 3000) {
  const start = performance.now();
  while (!check()) {
    assert.ok(performance.now() - start < timeout, message);
    await frame();
  }
}

function resume() {
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('UpdatePill', () => {
  it('stays hidden while the server runs the same deploy', async () => {
    const view = mount(['a']);
    await until(() => view.calls() > 0, 'checks the server on mount');
    await frame();
    assert.equal(view.$('[data-update-prompt]'), null);
    view.cleanup();
  });

  it('offers an update once a newer deploy is live, and loads the page afresh on tap', async () => {
    const view = mount(['b']);
    await until(() => view.$('[data-update-prompt]') !== null, 'shows the prompt');
    assert.equal(view.$('[data-update-prompt] p')!.textContent, 'New version available');

    const update = view.$('[data-update-now]')!;
    // A runtime-intercepted reload would keep the old scripts, so the browser must own this one.
    assert.ok(update.hasAttribute('data-rmx-document'));
    update.click();
    await frame();
    assert.deepEqual(view.navigations, [location.pathname + location.search]);
    assert.equal(view.$('[data-update-now]')!.textContent, 'Updating…');
    assert.equal(view.$('[data-update-now]')!.getAttribute('aria-disabled'), 'true');
    view.cleanup();
  });

  it('notices a deploy that lands while the app is in the background', async () => {
    const view = mount(['a', 'b']);
    await until(() => view.calls() === 1, 'checks the server on mount');
    await frame();
    assert.equal(view.$('[data-update-prompt]'), null);

    resume();
    await until(() => view.$('[data-update-prompt]') !== null, 'shows the prompt on resume');
    view.cleanup();
  });

  it('hides on "Later" and comes back when the app is next opened', async () => {
    const view = mount(['b']);
    await until(() => view.$('[data-update-prompt]') !== null, 'shows the prompt');

    view.$('[data-update-later]')!.click();
    await frame();
    assert.equal(view.$('[data-update-prompt]'), null);
    assert.deepEqual(view.navigations, []);

    resume();
    await until(() => view.$('[data-update-prompt]') !== null, 'shows the prompt again on resume');
    view.cleanup();
  });
});
