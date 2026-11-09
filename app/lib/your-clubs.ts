import type { Club, ClubSection } from './clubs.ts';

export type YourClubs = {
  clubs: Club[];
  savedIds: number[];
  unresolvedIds: number[];
  unavailable: boolean;
};

export function resolveYourClubs(
  savedIds: readonly number[],
  sections: readonly ClubSection[],
  complete: boolean,
): YourClubs {
  const tracked = new Map(
    sections.flatMap((section) => section.clubs.map((club) => [club.id, club] as const)),
  );
  const clubs: Club[] = [];
  const unresolvedIds: number[] = [];
  for (const id of savedIds) {
    const club = tracked.get(id);
    if (club) clubs.push(club);
    else if (!complete) unresolvedIds.push(id);
  }
  return {
    clubs,
    savedIds: [...clubs.map((club) => club.id), ...unresolvedIds],
    unresolvedIds,
    unavailable: clubs.length === 0 && unresolvedIds.length > 0,
  };
}
