import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { appVersionFromEnv } from './app-version.ts';

describe('appVersionFromEnv', () => {
  it('prefers the version CI stamps into the image', () => {
    assert.equal(
      appVersionFromEnv({ APP_VERSION: 'abc123', FLY_IMAGE_REF: 'registry.fly.io/otp:deployment-1' }),
      'abc123',
    );
  });

  it("falls back to Fly's image ref, which changes on every deploy", () => {
    assert.equal(
      appVersionFromEnv({ APP_VERSION: ' ', FLY_IMAGE_REF: 'registry.fly.io/otp:deployment-1' }),
      'registry.fly.io/otp:deployment-1',
    );
  });

  it("reads 'dev' when nothing names the deploy", () => {
    assert.equal(appVersionFromEnv({}), 'dev');
  });
});
