import { css, type Handle } from 'remix/component';

import { CompetitionTile } from './competition-tile.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standings: StandingsResponse[];
  onSelect: (standing: StandingsResponse, button: HTMLButtonElement) => void;
};

export function Standings(handle: Handle<Props>) {
  return () => (
    <div
      mix={css({
        display: 'flex',
        minWidth: 0,
        gap: 8,
        padding: '0 20px',
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        scrollPadding: '0 20px',
        scrollbarWidth: 'none',

        '&::-webkit-scrollbar': {
          display: 'none',
        },
      })}
    >
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
