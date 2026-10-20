import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { footballDataRepository } from '../lib/football-data-repository.ts'
import type { StandingsResponse } from '../lib/types/api.ts'
import { router } from '../router.ts'
import { routes } from '../routes.ts'

describe('root controller', () => {
  it('GET / renders standings for multiple competitions', async (t) => {
    const standings: StandingsResponse[] = [
      { id: 2021, name: 'Premier League', code: 'PL', type: 'LEAGUE', emblem: '' },
      { id: 2014, name: 'La Liga', code: 'PD', type: 'LEAGUE', emblem: '' },
    ].map((competition) => ({
      filters: { season: '2026' },
      area: { id: 2072, name: 'England', code: 'ENG', flag: '' },
      competition,
      season: {
        id: 2502,
        startDate: '2026-08-21',
        endDate: '2027-05-30',
        currentMatchday: 7,
        winner: null,
      },
      standings: [],
    }))
    const fetch = t.mock.method(
      footballDataRepository, 'fetchAllStandings', async () => standings,
    )
    const response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))

    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /Premier League/)
    assert.match(html, /La Liga/)
    assert.equal(fetch.mock.calls.length, 1)
  })
})
