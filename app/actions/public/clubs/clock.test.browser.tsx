import * as assert from 'remix/assert';
import { render } from 'remix/component/test';
import { renderToString } from 'remix/component/server';
import { it } from 'remix/test';
import { NOW, buildClub, buildClubMatches } from '../../../fixtures/builders.ts';
import { ClubCard } from './club-card.tsx';

it('hydrates a server club card with unchanged kickoff and countdown, then changes timezone', async (t) => {
  const club = buildClub();
  const matches = buildClubMatches({ fixtures: [{ utcDate: new Date(NOW + 11.5 * 3600000).toISOString() }] });
  const clock = { now: NOW, timeZone: 'UTC' };
  const element = () => <ClubCard club={club} matches={matches} clock={clock} />;
  const container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = await renderToString(element());
  const article = container.querySelector('article');
  const serverText = article!.textContent;
  assert.match(serverText!, /Next · Sun 23:30/);
  assert.match(serverText!, /11h30m/);
  const view = render(element(), { container });
  t.after(view.cleanup);
  assert.equal(container.querySelector('article'), article);
  assert.equal(article!.textContent, serverText);
  await view.act(() => {
    clock.timeZone = 'Europe/Madrid';
    view.root.render(element());
  });
  assert.equal(container.querySelector('article'), article);
  assert.match(article!.textContent!, /Next · Mon 00:30/);
  assert.match(article!.textContent!, /11h30m/);
});
