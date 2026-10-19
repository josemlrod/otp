import * as assert from 'remix/assert'
import { beforeAll, describe, it } from 'remix/test'

import { migrateDatabase } from '../db.ts'
import { router } from '../router.ts'
import { routes } from '../routes.ts'

describe('root controller', () => {
  beforeAll(() => migrateDatabase())

  it('GET / returns the home page', async () => {
    let response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))

    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type') ?? '', /text\/html/)
    assert.match(await response.text(), /<html[\s>]/)
  })
})
