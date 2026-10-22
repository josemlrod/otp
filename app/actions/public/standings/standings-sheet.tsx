import { css, on, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { sheetGrab, sheetScroll } from '../sheet.tsx';
import { StandingsTable } from './standings-table.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse;
  titleId: string;
  onClose: () => void;
};

function matchdayLabel(standing: StandingsResponse, leaguePhaseRounds?: number) {
  const phase = standing.competition.code === 'CL' ? 'League phase' : 'Matchday';
  const ofRounds = leaguePhaseRounds == null ? '' : ` of ${leaguePhaseRounds}`;
  return `${phase} ${standing.season.currentMatchday}${ofRounds}`;
}

export function StandingsSheet(handle: Handle<Props>) {
  return () => {
    countRender('StandingsSheet');
    const { standing, titleId, onClose } = handle.props;
    const metadata = getCompetitionMetadata(standing.competition.code);

    return (
      <>
        <div data-sheet-grab mix={sheetGrab}>
          <div
            mix={sheetBand}
            style={{
              '--competition': metadata.color,
              '--competition-accent': metadata.accent,
            }}
          >
            <span mix={competitionBadge}>
              <span mix={competitionMark} aria-hidden='true'>
                {metadata.mark}
              </span>
            </span>
            <span mix={sheetTitle}>
              <b id={titleId}>{standing.competition.name}</b>
              <span>{matchdayLabel(standing, metadata.leaguePhaseRounds)}</span>
            </span>
            <button
              type='button'
              data-sheet-autofocus
              mix={[sheetClose, on('click', onClose)]}
              aria-label='Close'
            >
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                stroke-width='2.6'
                stroke-linecap='round'
                aria-hidden='true'
              >
                <path d='M18 6 6 18M6 6l12 12' />
              </svg>
            </button>
          </div>
        </div>
        <div mix={sheetScroll} tabIndex={0}>
          <StandingsTable standing={standing} />
        </div>
      </>
    );
  };
}

const sheetBand = css({
  position: 'relative',
  flexShrink: 0,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  padding: `${space(5.5)} ${space(4)} ${space(4)}`,
  color: v('--color-white'),
  background: `linear-gradient(
    165deg,
    color-mix(in oklab, var(--competition) 82%, var(--color-white)) 0rem,
    var(--competition) 7.5rem,
    color-mix(in oklab, var(--competition) 72%, var(--color-black)) 22.5rem
  )`,
});

const competitionBadge = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: space(12.5),
  height: space(12.5),
});

const sheetTitle = css({
  flex: '1',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space(1),

  '& b': {
    fontSize: v('--text-xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    lineHeight: v('--leading-tight'),
  },

  '& > span': {
    fontSize: v('--text-xs'),
    opacity: 0.75,
  },
});

const sheetClose = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: space(8.5),
  height: space(8.5),
  borderRadius: v('--radius-full'),
  background: 'color-mix(in oklab, currentColor 18%, transparent)',
  transition: `transform ${v('--duration-press')} ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.9)',
  },

  '@media (prefers-reduced-motion: reduce)': {
    '&:active': {
      transform: 'none',
    },
  },

  '& svg': {
    width: space(4),
    height: space(4),
  },
});

export const competitionMark = css({
  '--mark-size': space(8.5),
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--mark-size)',
  height: 'var(--mark-size)',
  borderRadius: 'calc(var(--mark-size) * 0.3)',
  background: 'var(--competition)',
  color: 'var(--competition-accent)',
  fontSize: 'calc(var(--mark-size) * 0.44)',
  fontWeight: v('--font-weight-black'),
  letterSpacing: v('--tracking-tight'),
  lineHeight: v('--leading-none'),
  boxShadow: v('--shadow-badge'),
});
