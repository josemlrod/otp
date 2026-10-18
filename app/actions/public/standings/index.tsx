import { clientEntry, type Handle } from 'remix/component';

import { CompetitionTile } from './competition-tile.tsx';
import { Sheet } from './sheet.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

export const Standings = clientEntry(
  import.meta.url,
  function Standings(handle: Handle<{ standings: StandingsResponse[] }>) {
    const { standings } = handle.props;

    let selected: StandingsResponse | null = null;
    let open = false;

    function close() {
      open = false;
      selected = null;
      handle.update();
    }

    return () => (
      <div>
        {standings.map((standing) => (
          <CompetitionTile
            id={standing.competition.id}
            code={standing.competition.code}
            emblem={standing.competition.emblem}
            name={standing.competition.name}
            selectedTeams={[]}
            onPress={() => {
              selected = standing;
              open = true;
              handle.update();
            }}
          />
        ))}

        <code>{JSON.stringify({ open })}</code>

        <Sheet standing={selected} open={open} onClose={close} />
      </div>
    );
  },
);
