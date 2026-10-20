type CompetitionMetadata = {
  readonly color: string;
  readonly accent: string;
  readonly mark: string;
  readonly leaguePhaseRounds?: number;
};

const METADATA_BY_COMPETITION_CODE = new Map<string, CompetitionMetadata>([
  ['PL', { color: 'oklch(27.2% 0.114 319)', accent: 'oklch(87.6% 0.23 152)', mark: 'PL', leaguePhaseRounds: 38 }],
  ['PD', { color: 'oklch(62% 0.207 30.7)', accent: 'oklch(93.7% 0.086 91.6)', mark: 'LL', leaguePhaseRounds: 38 }],
  ['SA', { color: 'oklch(34.3% 0.135 261.2)', accent: 'oklch(82.8% 0.12 222.4)', mark: 'SA', leaguePhaseRounds: 38 }],
  ['BL1', { color: 'oklch(52.6% 0.212 26.4)', accent: 'oklch(100% 0 0)', mark: 'BL', leaguePhaseRounds: 34 }],
  ['CL', { color: 'oklch(25.6% 0.11 266.1)', accent: 'oklch(84.4% 0.091 234.7)', mark: '★', leaguePhaseRounds: 8 }],
]);

export function getCompetitionMetadata(code: string): CompetitionMetadata {
  return (
    METADATA_BY_COMPETITION_CODE.get(code) ?? {
      color: 'oklch(32.4% 0.014 261.7)',
      accent: 'oklch(100% 0 0)',
      mark: code,
    }
  );
}
