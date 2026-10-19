type CompetitionMetadata = {
  readonly color: string;
  readonly accent: string;
  readonly mark: string;
  readonly rounds?: number;
};

// Presentation defaults from public/prototypes/home/data.js, keyed by API code.
// Round counts describe the league phase and may change between seasons.
export const COMPETITION_METADATA: Readonly<
  Partial<Record<string, CompetitionMetadata>>
> = {
  PL: { color: '#3D0A49', accent: '#00FF85', mark: 'PL', rounds: 38 },
  PD: { color: '#E8412C', accent: '#FFE9A8', mark: 'LL', rounds: 38 },
  SA: { color: '#08327D', accent: '#5FD8FF', mark: 'SA', rounds: 38 },
  BL1: { color: '#C8061A', accent: '#FFFFFF', mark: 'BL', rounds: 34 },
  CL: { color: '#0A1B57', accent: '#8FD6FF', mark: '★', rounds: 8 },
};

export function getCompetitionMetadata(code: string): CompetitionMetadata {
  const metadata = COMPETITION_METADATA[code];
  if (Object.hasOwn(COMPETITION_METADATA, code) && metadata) return metadata;

  return { color: '#30343B', accent: '#FFFFFF', mark: code };
}

export const COMPETITION_IDS = {
  PL: 2021,
  BL1: 2002,
  SA: 2019,
  PD: 2014,
  FL1: 2015,
  CL: 2001,
};
