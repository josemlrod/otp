import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { footballDataRepository } from '../lib/football-data-repository.ts'
import { buildTeam, buildStandings } from '../fixtures/builders.ts'
import { router } from '../router.ts'
import { routes } from '../routes.ts'

describe('root controller', () => {
  it('GET / renders standings for multiple competitions', async (t) => {
    const standings = [buildStandings('PL', { groups: [] }), buildStandings('PD', { groups: [] })]
    const fetch = t.mock.method(
      footballDataRepository, 'fetchAllStandings', async () => standings,
    )
    const response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))

    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /Premier League/)
    assert.match(html, /La Liga/)
    assert.equal(fetch.mock.calls.length, 1)
    assert.match(html, /Build your stack/)
  })

  it('GET / swaps the empty state for a count when the follows cookie names known clubs', async (t) => {
    const standings = [buildStandings('PL', {
      clubs: [buildTeam({ id: 57, shortName: 'Arsenal', tla: 'ARS' })],
      rows: [{
        playedGames: 7,
        won: 7,
        points: 21,
        goalsFor: 14,
        goalsAgainst: 2,
        goalDifference: 12,
      }],
    })]
    t.mock.method(footballDataRepository, 'fetchAllStandings', async () => standings)
    const cards = t.mock.method(footballDataRepository, 'fetchAllTeamCards', async () => [])
    const response = await router.fetch(
      new Request(new URL(routes.home.href(), 'http://localhost'), {
        headers: { Cookie: 'otp_follows=57.999' },
      }),
    )

    const html = await response.text()
    assert.match(html, /Your clubs · 1/)
    assert.doesNotMatch(html, /Build your stack/)
    assert.deepEqual(cards.mock.calls[0]?.arguments, [[57]])
  })
})
