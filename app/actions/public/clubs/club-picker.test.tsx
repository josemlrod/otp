import * as assert from 'remix/assert';
import { renderToString } from 'remix/component/server';
import { it } from 'remix/test';

import { buildClub } from '../../../fixtures/builders.ts';
import { ClubPicker } from './club-picker.tsx';

it('counts every picked club without favourite treatment', async () => {
  const clubs = Array.from({ length: 6 }, (_, index) => buildClub({ id: index + 1 }));
  for (const [count, text] of [[0, 'Pick as many as you like'], [1, '1 club'], [6, '6 clubs']] as const) {
    const html = await renderToString(
      <ClubPicker
        sections={[{ code: 'PL', name: 'Premier League', clubs }]}
        initial={clubs.slice(0, count).map((club) => club.id)}
        titleId='picker-title'
        onChange={() => {}}
        onDone={() => {}}
      />,
    );
    assert.match(html, new RegExp(`>${text}</span>`));
    assert.doesNotMatch(html, /stay on top/);
  }
});
