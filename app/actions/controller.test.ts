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
    assert.match(html, /Build your stack/)
  })

  it('GET / swaps the empty state for a count when the follows cookie names known clubs', async (t) => {
    const team = { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '' }
    const standings: StandingsResponse[] = [{
      filters: { season: '2026' },
      area: { id: 2072, name: 'England', code: 'ENG', flag: '' },
      competition: { id: 2021, name: 'Premier League', code: 'PL', type: 'LEAGUE', emblem: '' },
      season: { id: 2502, startDate: '', endDate: '', currentMatchday: 7, winner: null },
      standings: [{
        stage: 'REGULAR_SEASON',
        type: 'TOTAL',
        group: null,
        table: [{
          position: 1, team, playedGames: 7, form: null, won: 7, draw: 0, lost: 0,
          points: 21, goalsFor: 14, goalsAgainst: 2, goalDifference: 12,
        }],
      }],
    }]
    t.mock.method(footballDataRepository, 'fetchAllStandings', async () => standings)
    const response = await router.fetch(
      new Request(new URL(routes.home.href(), 'http://localhost'), {
        headers: { Cookie: 'otp_follows=57.999' },
      }),
    )

    const html = await response.text()
    assert.match(html, /Your clubs · 1/)
    assert.doesNotMatch(html, /Build your stack/)
  })
})
