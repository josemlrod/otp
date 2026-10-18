import { css, on, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';

type CompetitionTileProps = {
  id: number;
  code: string;
  emblem: string;
  name: string;
  selectedTeams: number[];
  onPress: () => void;
};

export function CompetitionTile(handle: Handle<CompetitionTileProps>) {
  return () => {
    const { id, code, emblem, name, selectedTeams, onPress } = handle.props;
    const noSelectedTeams = !selectedTeams.length;
    const metadata = getCompetitionMetadata(code);

    return (
      <button
        id={String(id)}
        style={{
          '--c': metadata.color,
          '--ca': metadata.accent,
          '--ink': '#fff',
        }}
        mix={[
          css({
            width: 250,
            gap: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 18,
            border: 'none',
            padding: 12,
            background: 'var(--c)',
            color: 'var(--ink)',
          }),
          on('click', () => onPress()),
        ]}
      >
        <div
          mix={css({
            display: 'flex',
            gap: '0.50rem',
            width: '100%',
            alignItems: 'center',
          })}
        >
          <img
            alt={`${name}'s crest`}
            src={emblem}
            mix={css({ height: 22, width: 22 })}
          />
          <p mix={css({ fontWeight: 750, fontSize: '0.875rem' })}>{name}</p>
        </div>

        {noSelectedTeams ? (
          <p mix={css({ textAlign: 'start' })}>No selected teams</p>
        ) : (
          <div
            mix={css({
              display: 'flex',
              gap: '0.50rem',
              width: '100%',
              alignItems: 'center',
            })}
          >
            <img
              alt={`${name}'s crest`}
              src={emblem}
              mix={css({ height: 22, width: 22 })}
            />
            <p mix={css({ fontWeight: 750, fontSize: '0.875rem' })}>{name}</p>
          </div>
        )}
      </button>
    );
  };
}
