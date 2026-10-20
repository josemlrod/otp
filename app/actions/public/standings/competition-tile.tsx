import { css, on, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';

type CompetitionTileProps = {
  id: number;
  code: string;
  emblem: string;
  name: string;
  selectedTeams: number[];
  onPress: (button: HTMLButtonElement) => void;
};

export function CompetitionTile(handle: Handle<CompetitionTileProps>) {
  return () => {
    countRender('CompetitionTile');
    const { id, code, emblem, name, selectedTeams, onPress } = handle.props;
    const noSelectedTeams = !selectedTeams.length;
    const metadata = getCompetitionMetadata(code);

    return (
      <button
        type='button'
        id={String(id)}
        style={{
          '--competition': metadata.color,
          '--competition-accent': metadata.accent,
        }}
        mix={[tileStyles, on('click', (event) => onPress(event.currentTarget))]}
      >
        <div mix={rowStyles}>
          <img alt={`${name}'s crest`} src={emblem} mix={crestStyles} />
          <p mix={nameStyles}>{name}</p>
        </div>

        {noSelectedTeams ? (
          <p mix={emptyStyles}>No selected teams</p>
        ) : (
          <div mix={rowStyles}>
            <img alt={`${name}'s crest`} src={emblem} mix={crestStyles} />
            <p mix={nameStyles}>{name}</p>
          </div>
        )}
      </button>
    );
  };
}

const tileStyles = css({
  flex: 'none',
  minWidth: space(39),
  scrollSnapAlign: 'start',
  display: 'flex',
  flexDirection: 'column',
  gap: space(3),
  borderRadius: v('--radius-lg'),
  padding: space(3),
  background: `linear-gradient(
    160deg,
    color-mix(in oklab, var(--competition) 80%, var(--color-white)) 0%,
    var(--competition) 55%,
    color-mix(in oklab, var(--competition) 70%, var(--color-black)) 100%
  )`,
  boxShadow: v('--shadow-highlight'),
  color: v('--color-white'),
});

const rowStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  width: '100%',
});

const crestStyles = css({
  width: space(5.5),
  height: space(5.5),
});

const nameStyles = css({
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-extrabold'),
  whiteSpace: 'nowrap',
});

const emptyStyles = css({
  fontSize: v('--text-xs'),
  textAlign: 'start',
});
