import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { assets } from './assets.ts';

describe('asset access', () => {
  for (const file of ['app/actions/public/entry.ts', 'app/actions/public/home-screen.tsx']) {
    it(`serves every module ${file} imports`, async () => {
      const { preloads } = await assets.getScriptEntry(file);

      for (const href of preloads) {
        const response = await assets.fetch(new Request(new URL(href, 'http://localhost')));
        assert.equal(response?.status, 200, href);
      }
    });
  }
});
