import { css, type Handle } from 'remix/component';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse;
};

export function StandingsTable(handle: Handle<Props>) {
  return () => {
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
                  <col style={{ width: 40 }} />
                  <col />
                  <col style={{ width: 30 }} />
                  <col style={{ width: 40 }} />
                  <col style={{ width: 44 }} />
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
  padding: '0 16px',
});

const tableCard = css({
  marginTop: 12,
  borderRadius: 14,
  background: 'var(--surface-2)',
  overflow: 'hidden',
});

const tableStyle = css({
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: 13,
  textAlign: 'right',

  '& th, & td': {
    padding: '0 4px',
    height: 38,
  },
  '& th:first-child, & td:first-child': {
    textAlign: 'center',
    paddingLeft: 12,
  },
  '& th:last-child, & td:last-child': {
    paddingRight: 12,
  },
  '& thead th': {
    height: 32,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
  },
  '& thead th:nth-child(2)': {
    textAlign: 'left',
  },
  '& tbody tr': {
    color: 'var(--text-2)',
    boxShadow: 'inset 0 0.5px 0 var(--sep)',
  },
  '& tbody th': {
    fontWeight: 550,
    textAlign: 'left',
  },
  '& b': {
    color: 'var(--text)',
  },
});

const positionStyle = css({
  color: 'var(--text-3)',
  fontWeight: 600,
});

const clubStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  color: 'var(--text)',

  '& img': {
    display: 'block',
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
  padding: '12px 12px 4px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--text)',
});

const hiddenCaption = css({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
});

const emptyState = css({
  padding: '16px 12px',
  fontSize: 13,
  color: 'var(--text-2)',
  textAlign: 'center',
});
