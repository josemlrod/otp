import { css, type Handle } from 'remix/component';

import { CompetitionTile } from './competition-tile.tsx';
import { countRender } from '../perf/renders.ts';
import { hideScrollbar, space, v } from '../../../ui/theme.ts';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standings: StandingsResponse[];
  onSelect: (standing: StandingsResponse, button: HTMLButtonElement) => void;
};

export function Standings(handle: Handle<Props>) {
  return () => {
    countRender('Standings');

    return (
      <div mix={[shelfStyles, hideScrollbar]}>
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
  };
}

const shelfStyles = css({
  display: 'flex',
  minWidth: 0,
  gap: space(2),
  padding: `0 ${v('--gutter')}`,
  overflowX: 'auto',
  scrollSnapType: 'x proximity',
  scrollPadding: `0 ${v('--gutter')}`,
});
