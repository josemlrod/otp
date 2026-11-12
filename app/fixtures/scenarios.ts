import { buildMatches, buildStandings, buildTeam } from './builders.ts';
import type { MatchOptions } from './builders.ts';
import type { FootballDataFetcher } from '../lib/football-data.ts';

export const scenarioNames = ['matchday', 'api-down', 'no-fixtures', 'league-down'] as const;
export type ScenarioName = (typeof scenarioNames)[number];

export function scenarioFetcher(name: string, now: number): FootballDataFetcher {
  if (!scenarioNames.includes(name as ScenarioName)) {
    throw new Error(`Unknown OTP_SCENARIO "${name}". Valid scenarios: ${scenarioNames.join(', ')}`);
  }

  const responses = new Map<string, unknown>();
  const competitions = [
    [
      'PL',
      [
        [57, 'Arsenal'],
        [64, 'Liverpool'],
        [61, 'Chelsea'],
      ],
    ],
    [
      'BL1',
      [
        [5, 'Bayern Munich'],
        [4, 'Dortmund'],
        [721, 'RB Leipzig'],
      ],
    ],
    [
      'SA',
      [
        [108, 'Inter'],
        [113, 'Napoli'],
        [109, 'Juventus'],
      ],
    ],
    [
      'PD',
      [
        [81, 'Barcelona'],
        [86, 'Real Madrid'],
        [78, 'Atlético Madrid'],
      ],
    ],
    [
      'FL1',
      [
        [524, 'Paris Saint-Germain'],
        [516, 'Marseille'],
        [523, 'Lyon'],
      ],
    ],
    [
      'CL',
      [
        [1903, 'Benfica'],
        [498, 'Sporting CP'],
        [678, 'Ajax'],
        [57, 'Arsenal'],
        [5, 'Bayern Munich'],
        [108, 'Inter'],
        [86, 'Real Madrid'],
      ],
    ],
  ] as const;
  competitions.forEach(([code, descriptions]) => {
    // Bayern must also be absent from CL to exercise an unresolved saved club.
    const available =
      name === 'league-down' && code === 'CL'
        ? descriptions.filter(([id]) => id !== 5)
        : descriptions;
    const clubs = available.map(([id, shortName]) => buildTeam({ id, shortName }));
    const standings = buildStandings(code, { clubs });
    responses.set(`/v4/competitions/${standings.competition.id}/standings`, standings);
    clubs.forEach((club, i) => {
      const path = `/v4/teams/${club.id}/matches`;
      if (responses.has(path)) {
        return;
      }
      const form = ['WWDLW', 'LDWWD', 'DLLWL'][i % 3];
      function description(index: number): MatchOptions {
        const opponents = clubs.filter((opponent) => opponent.id !== club.id);
        return {
          opponent: opponents[index % opponents.length],
          venue: index % 2 === 0 ? 'H' : 'A',
          competition: code,
        };
      }
      responses.set(
        path,
        buildMatches({
          club,
          now,
          results: [...form].map((result, index) => ({
            ...description(index),
            result: result as 'W' | 'D' | 'L',
            days: -(form.length - index) * 7,
          })),
          fixtures:
            name === 'no-fixtures' && club.id === 57
              ? []
              : [i === 0 ? 0.1 : 2, 7, 14].map((days, index) => ({
                  ...description(form.length + index),
                  days,
                })),
        }),
      );
    });
  });
  return async (path) => {
    if (
      name === 'api-down' ||
      (name === 'league-down' && path === '/v4/competitions/2002/standings')
    ) {
      return new Response('Service unavailable', { status: 503 });
    }
    const data = responses.get(path);
    return data ? Response.json(data) : new Response('Not Found', { status: 404 });
  };
}
