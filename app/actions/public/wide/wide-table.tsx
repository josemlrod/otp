import { css, type Handle } from 'remix/component';

import { signed } from '../../../lib/standings.ts';
import type { StandingTableRow } from '../../../lib/types/api.ts';
import { space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';

type Props = {
  caption: string;
  rows: StandingTableRow[];
  /** Clubs to highlight: Your clubs, or the club whose page this is. */
  mine: ReadonlySet<number>;
};

// The standings table for the wide layout. Your clubs' rows are lit, and once the table's card is
// wide enough it also carries W D L GF GA.
export function WideTable(handle: Handle<Props>) {
  return () => {
    countRender('WideTable');
    const { caption, rows, mine } = handle.props;

    return (
      <table mix={tableStyles}>
        <caption mix={captionStyles}>{caption}</caption>
        <thead>
          <tr>
            <th scope='col' abbr='Position'>#</th>
            <th scope='col'>Club</th>
            <th scope='col' abbr='Matches played'>P</th>
            <th scope='col' data-x abbr='Won'>W</th>
            <th scope='col' data-x abbr='Drawn'>D</th>
            <th scope='col' data-x abbr='Lost'>L</th>
            <th scope='col' data-x abbr='Goals for'>GF</th>
            <th scope='col' data-x abbr='Goals against'>GA</th>
            <th scope='col' abbr='Goal difference'>GD</th>
            <th scope='col' abbr='Points'>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.id} data-mine={mine.has(row.team.id) ? '' : undefined}>
              <td data-pos>{row.position}</td>
              <th scope='row'>
                <span mix={clubStyles}>
                  {row.team.crest && (
                    <img src={row.team.crest} alt='' width={18} height={18} loading='lazy' decoding='async' />
                  )}
                  <span title={row.team.name}>{row.team.shortName || row.team.name}</span>
                </span>
              </th>
              <td>{row.playedGames}</td>
              <td data-x>{row.won}</td>
              <td data-x>{row.draw}</td>
              <td data-x>{row.lost}</td>
              <td data-x>{row.goalsFor}</td>
              <td data-x>{row.goalsAgainst}</td>
              <td>{signed(row.goalDifference)}</td>
              <td>
                <b>{row.points}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
}

// Same look as the standings sheet's table (standings-table.tsx), sized by content so the
// optional columns can come and go.
const tableStyles = css({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: v('--text-xs'),
  textAlign: 'right',

  '& th, & td': {
    height: space(9.5),
    padding: `0 ${space(2)}`,
    whiteSpace: 'nowrap',
  },
  '& th:nth-child(2)': {
    width: '100%',
    maxWidth: 0,
  },
  '& th:first-child, & td:first-child': {
    paddingLeft: space(3),
    textAlign: 'center',
  },
  '& th:last-child, & td:last-child': {
    paddingRight: space(3),
  },
  '& thead th': {
    height: space(8),
    fontSize: v('--text-2xs'),
    fontWeight: v('--font-weight-semibold'),
    color: v('--color-text-tertiary'),
    textTransform: 'uppercase',
  },
  '& thead th:nth-child(2)': {
    textAlign: 'left',
  },
  '& tbody tr': {
    color: v('--color-text-secondary'),
    boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,
  },
  '& tbody th': {
    fontWeight: v('--font-weight-semibold'),
    textAlign: 'left',
  },
  '& b': {
    color: v('--color-text'),
  },
  '& [data-pos]': {
    fontWeight: v('--font-weight-semibold'),
    color: v('--color-text-tertiary'),
  },
  '& tr[data-mine]': {
    background: `color-mix(in oklab, ${v('--color-accent')} 9%, transparent)`,
    color: v('--color-text'),
  },
  '& tr[data-mine] [data-pos]': {
    color: v('--color-accent'),
  },
  '& [data-x]': {
    display: 'none',
  },

  // Room for the full line once the card is wide enough to carry it.
  '@container (min-width: 30rem)': {
    '& [data-x]': {
      display: 'table-cell',
      color: v('--color-text-tertiary'),
    },
    '& tr[data-mine] [data-x]': {
      color: v('--color-text-secondary'),
    },
  },
});

const clubStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  minWidth: 0,
  color: v('--color-text'),

  '& img': {
    flexShrink: 0,
    width: space(4.5),
    height: space(4.5),
    objectFit: 'contain',
  },

  '& > span': {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
});

const captionStyles = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
});
