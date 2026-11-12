import type { StandingTableRow, StandingsResponse } from './types/api.ts';

// Lookups over tracked competitions' standings, for screens that show a club's line in a table
// or set two clubs' lines side by side.

/** Every row of a competition's overall (TOTAL) table, across groups. */
export function totalRows(standing: StandingsResponse): StandingTableRow[] {
  return standing.standings
    .filter((group) => group.type === 'TOTAL')
    .flatMap((group) => group.table);
}

export function findStanding(standings: readonly StandingsResponse[], code: string) {
  return standings.find((standing) => standing.competition.code === code);
}

/** A club's row in one competition's standings, if it plays in it. */
export function standingRow(
  standings: readonly StandingsResponse[],
  code: string,
  clubId: number,
): StandingTableRow | undefined {
  const standing = findStanding(standings, code);
  return standing && totalRows(standing).find((row) => row.team.id === clubId);
}

/** `size` consecutive rows with the club as close to the middle as the table allows. */
export function rowsAround(rows: readonly StandingTableRow[], clubId: number, size = 5) {
  const index = rows.findIndex((row) => row.team.id === clubId);
  const start = Math.min(
    Math.max(0, index - Math.floor(size / 2)),
    Math.max(0, rows.length - size),
  );
  return rows.slice(start, start + size);
}

export const pointsPerGame = (row: StandingTableRow) =>
  row.points / Math.max(1, row.playedGames);

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
