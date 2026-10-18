import type { Handle } from 'remix/component';

import { CompetitionTile } from './competition-tile.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standings: StandingsResponse[];
  onSelect: (standing: StandingsResponse, button: HTMLButtonElement) => void;
};

export function Standings(handle: Handle<Props>) {
  return () => (
    <div>
      {handle.props.standings.map((standing) => (
        <CompetitionTile
          key={standing.competition.id}
          id={standing.competition.id}
          code={standing.competition.code}
          emblem={standing.competition.emblem}
          name={standing.competition.name}
          selectedTeams={[]}
          onPress={(button) => handle.props.onSelect(standing, button)}
        />
      ))}
    </div>
  );
}
