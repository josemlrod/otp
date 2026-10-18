import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { assets } from './assets.ts';

describe('asset access', () => {
  it('compiles the home screen browser dependency graph', async () => {
    const entry = await assets.getScriptEntry('app/actions/public/home-screen.tsx');
    const response = await assets.fetch(
      new Request(new URL(entry.href, 'http://localhost')),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  });

  for (const file of ['competition-tile.tsx', 'sheet.tsx', 'index.tsx']) {
    it(`compiles the standings ${file} browser dependency graph`, async () => {
      const entry = await assets.getScriptEntry(
        `app/actions/public/standings/${file}`,
      );
      const response = await assets.fetch(
        new Request(new URL(entry.href, 'http://localhost')),
      );

      assert.ok(response);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).length > 0);
    });
  }

  it('serves competition presentation metadata', async () => {
    const details = await assets.getAssetDetails('app/lib/competition-metadata.ts');
    assert.equal(details?.access?.allowed, true);
    assert.equal(details?.status, 'reachable');

    const href = await assets.getHref('app/lib/competition-metadata.ts');
    const response = await assets.fetch(
      new Request(new URL(href, 'http://localhost')),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /#3D0A49/);
  });

  for (const file of [
    'app/lib/football-data-repository.ts',
    'app/lib/competition-metadata.test.ts',
    'app/assets.test.ts',
  ]) {
    it(`keeps ${file} private`, async () => {
      const details = await assets.getAssetDetails(file);

      assert.equal(details?.access?.allowed, false);
      assert.equal(details?.status, 'not-allowed');
    });
  }
});
