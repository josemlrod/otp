import { css, type Handle } from 'remix/component';

import { countRender } from '../perf/renders.ts';
import { space, v } from '../../../ui/theme.ts';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse;
};

export function StandingsTable(handle: Handle<Props>) {
  return () => {
    countRender('StandingsTable');
    const { standing } = handle.props;
    const groups = standing.standings.filter((group) => group.type === 'TOTAL');

    return (
      <div mix={tableContent}>
        {groups.length === 0 ? (
          <p mix={emptyState}>No standings available.</p>
        ) : (
          groups.map((group, index) => (
            <div mix={tableCard} key={`${group.stage}-${group.group ?? index}`}>
              <table mix={tableStyle}>
                <caption mix={groups.length > 1 ? groupCaption : hiddenCaption}>
                  {standing.competition.name} standings
                  {group.group && `, ${group.group.replaceAll('_', ' ')}`}
                </caption>
                <colgroup>
                  <col style={{ width: space(10) }} />
                  <col />
                  <col style={{ width: space(7.5) }} />
                  <col style={{ width: space(10) }} />
                  <col style={{ width: space(11) }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope='col' abbr='Position'>#</th>
                    <th scope='col'>Club</th>
                    <th scope='col' abbr='Matches played'>P</th>
                    <th scope='col' abbr='Goal difference'>GD</th>
                    <th scope='col' abbr='Points'>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {group.table.length === 0 ? (
                    <tr>
                      <td colSpan={5} mix={emptyState}>No standings available.</td>
                    </tr>
                  ) : (
                    group.table.map((row) => (
                      <tr key={row.team.id}>
                        <td mix={positionStyle}>{row.position}</td>
                        <th scope='row'>
                          <span mix={clubStyle}>
                            {row.team.crest && (
                              <img
                                src={row.team.crest}
                                alt=''
                                width={18}
                                height={18}
                                loading='lazy'
                                decoding='async'
                              />
                            )}
                            <span title={row.team.name}>
                              {row.team.shortName || row.team.name}
                            </span>
                          </span>
                        </th>
                        <td>{row.playedGames}</td>
                        <td>
                          {row.goalDifference > 0
                            ? `+${row.goalDifference}`
                            : row.goalDifference}
                        </td>
                        <td><b>{row.points}</b></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    );
  };
}

const tableContent = css({
  padding: `0 ${space(4)}`,
});

const tableCard = css({
  marginTop: space(3),
  borderRadius: v('--radius-md'),
  background: v('--color-surface-raised'),
  overflow: 'hidden',
});

const tableStyle = css({
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: v('--text-xs'),
  textAlign: 'right',

  '& th, & td': {
    padding: `0 ${space(1)}`,
    height: space(9.5),
  },
  '& th:first-child, & td:first-child': {
    textAlign: 'center',
    paddingLeft: space(3),
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
});

const positionStyle = css({
  color: v('--color-text-tertiary'),
  fontWeight: v('--font-weight-semibold'),
});

const clubStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  minWidth: 0,
  color: v('--color-text'),

  '& img': {
    width: space(4.5),
    height: space(4.5),
    flexShrink: 0,
    objectFit: 'contain',
  },
  '& > span': {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
});

const groupCaption = css({
  padding: `${space(3)} ${space(3)} ${space(1)}`,
  textAlign: 'left',
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-text'),
});

const hiddenCaption = css({
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

const emptyState = css({
  padding: `${space(4)} ${space(3)}`,
  fontSize: v('--text-xs'),
  color: v('--color-text-secondary'),
  textAlign: 'center',
});
