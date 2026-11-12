import { css, on, type Handle } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { ordinal, soon } from '../../../lib/match-format.ts';
import { totalRows } from '../../../lib/standings.ts';
import type { StandingsResponse } from '../../../lib/types/api.ts';
import { space, v } from '../../../ui/theme.ts';
import { ClubCrest } from '../clubs/club-crest.tsx';
import type { MatchesModel } from '../clubs/matches.ts';
import { countRender } from '../perf/renders.ts';
import {
  competitionBadge,
  competitionMark,
  matchdayLabel,
  sheetBand,
  sheetTitle,
} from '../standings/standings-sheet.tsx';
import type { Plan } from './flow.ts';
import { FlowGrid } from './flow-grid.tsx';
import { cardStyles, formDotsStyles, labelStyles } from './parts.tsx';
import type { Selection } from './selection.ts';
import { WideTable } from './wide-table.tsx';

// A competition's page in the wide layout: the full table, which gains W D L GF GA once there's
// room, beside Your clubs in it.

const COMPETITION_PLANS: Plan[] = [
  { min: 0, cols: [['yours', 'table']] },
  { min: 560, cols: [['table'], ['yours']], template: 'minmax(0, 1.75fr) minmax(0, 1fr)' },
];

type Props = {
  standing: StandingsResponse;
  clubs: Club[];
  matches: MatchesModel;
  clock: Clock;
  onSelect: (selection: Selection) => void;
};

export function CompetitionPage(handle: Handle<Props>) {
  return () => {
    countRender('CompetitionPage');
    const { standing, clubs, matches, clock, onSelect } = handle.props;
    const metadata = getCompetitionMetadata(standing.competition.code);
    const groups = standing.standings.filter((group) => group.type === 'TOTAL');
    const rows = totalRows(standing);
    const yours = clubs.filter((club) => rows.some((row) => row.team.id === club.id));
    const mine = new Set(yours.map((club) => club.id));

    return (
      <>
        <header
          mix={[sheetBand, bandStyles]}
          style={{ '--competition': metadata.color, '--competition-accent': metadata.accent }}
        >
          <span mix={competitionBadge}>
            <span mix={competitionMark} aria-hidden='true'>
              {metadata.mark}
            </span>
          </span>
          <span mix={sheetTitle}>
            <h2>{standing.competition.name}</h2>
            <span>{matchdayLabel(standing, metadata.leaguePhaseRounds)}</span>
          </span>
        </header>
        <FlowGrid
          plans={COMPETITION_PLANS}
          blocks={{
            table: (
              <div mix={cardStyles}>
                {groups.length === 0 || rows.length === 0 ? (
                  <p mix={emptyStyles}>No standings available.</p>
                ) : (
                  groups.map((group, index) => (
                    <WideTable
                      key={`${group.stage}-${group.group ?? index}`}
                      caption={`${standing.competition.name} standings${group.group ? `, ${group.group.replaceAll('_', ' ')}` : ''}`}
                      rows={group.table}
                      mine={mine}
                    />
                  ))
                )}
              </div>
            ),
            yours: yours.length > 0 && (
              <>
                <p mix={labelStyles}>Your clubs · {yours.length}</p>
                <div mix={[cardStyles, yoursStyles]}>
                  {yours.map((club) => {
                    const row = rows.find((r) => r.team.id === club.id)!;
                    const entry = matches.get(club.id);
                    const clubMatches = entry && entry.status !== 'error' ? entry.matches : undefined;
                    const next = clubMatches?.fixtures[0];
                    return (
                      <button
                        key={club.id}
                        type='button'
                        mix={[clubRowStyles, on('click', () => onSelect({ kind: 'club', id: club.id }))]}
                      >
                        <ClubCrest crest={club.crest} size={space(9)} />
                        <span mix={clubIdStyles}>
                          <b>{club.name}</b>
                          <small>
                            {row.points} pts{next ? ` · next ${soon(new Date(next.utcDate), clock)}` : ''}
                          </small>
                        </span>
                        {clubMatches && (
                          <span mix={formDotsStyles} aria-label='Last five'>
                            {clubMatches.form.map((match, i) => (
                              <i key={i} data-r={match.result} />
                            ))}
                          </span>
                        )}
                        <span mix={positionStyles}>{ordinal(row.position)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ),
          }}
        />
      </>
    );
  };
}

const bandStyles = css({
  flex: 'none',
  borderRadius: v('--radius-lg'),
  padding: space(4),

  '& h2': {
    fontSize: v('--text-xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    lineHeight: v('--leading-tight'),
  },
});

const emptyStyles = css({
  padding: `${space(4)} ${space(3)}`,
  fontSize: v('--text-xs'),
  textAlign: 'center',
  color: v('--color-text-secondary'),
});

const yoursStyles = css({
  display: 'flex',
  flexDirection: 'column',
});

const clubRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  height: space(15),
  padding: `0 ${space(4)}`,
  textAlign: 'left',

  '& + &': {
    boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,
  },

  '&:active': {
    background: v('--color-press'),
  },

  '&:focus-visible': {
    outline: `2px solid ${v('--color-accent')}`,
    outlineOffset: '-2px',
  },
});

const clubIdStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1),
  minWidth: 0,

  '& b': {
    overflow: 'hidden',
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-bold'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },

  '& small': {
    overflow: 'hidden',
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
});

const positionStyles = css({
  flex: 'none',
  minWidth: space(9),
  fontWeight: v('--font-weight-extrabold'),
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});
