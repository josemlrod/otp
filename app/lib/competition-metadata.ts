type CompetitionMetadata = {
  readonly color: string;
  readonly accent: string;
  readonly mark: string;
  readonly leaguePhaseRounds?: number;
};

const METADATA_BY_COMPETITION_CODE = new Map<string, CompetitionMetadata>([
  ['PL', { color: '#3D0A49', accent: '#00FF85', mark: 'PL', leaguePhaseRounds: 38 }],
  ['PD', { color: '#E8412C', accent: '#FFE9A8', mark: 'LL', leaguePhaseRounds: 38 }],
  ['SA', { color: '#08327D', accent: '#5FD8FF', mark: 'SA', leaguePhaseRounds: 38 }],
  ['BL1', { color: '#C8061A', accent: '#FFFFFF', mark: 'BL', leaguePhaseRounds: 34 }],
  ['CL', { color: '#0A1B57', accent: '#8FD6FF', mark: '★', leaguePhaseRounds: 8 }],
]);

export function getCompetitionMetadata(code: string): CompetitionMetadata {
  return (
    METADATA_BY_COMPETITION_CODE.get(code) ?? {
      color: '#30343B',
      accent: '#FFFFFF',
      mark: code,
    }
  );
}
