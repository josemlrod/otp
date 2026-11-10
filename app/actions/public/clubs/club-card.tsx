import { css, on, ref, type Handle, type RemixNode } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import {
  countdown,
  day,
  ordinal,
  resultWord,
  shortDate,
  time,
  versus,
} from '../../../lib/match-format.ts';
import type { Fixture, PlayedMatch, TeamCard } from '../../../lib/team-card.ts';
import { space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { ClubCrest } from './club-crest.tsx';
import { wireTimeline } from './timeline.ts';

// The full club card: crest, name, form strip and the next-match block. The strip and the block
// are one timeline (see timeline.ts). A card that hasn't loaded yet keeps its header and shows a
// skeleton, or a retry if the request failed.

type CardProps = { club: Club; card: TeamCard; clock: Clock };

export function ClubCard(handle: Handle<CardProps>) {
  return () => {
    countRender('ClubCard');
    const { club, card, clock } = handle.props;
    const fixtures = card.fixtures;

    return (
      <article
        data-club-card
        data-now
        mix={[cardStyles, ref((node, signal) => wireTimeline(node, signal))]}
      >
        <Strip club={club}>
          <span data-form mix={formStyles}>
            <span data-lens aria-hidden='true' mix={lensStyles} />
            <ol data-pills aria-label='Last five, oldest first' mix={pillsStyles}>
              {card.form.map((match, i) => (
                <li key={i} data-pill data-r={match.result} mix={pillStyles}>
                  {match.result}
                </li>
              ))}
              <li data-pill data-lit mix={nextPillStyles}>
                Next
              </li>
            </ol>
          </span>
        </Strip>

        <div mix={blockStyles}>
          <div data-pager mix={pagerStyles}>
            <div
              data-track
              mix={trackStyles}
              style={{ transform: `translateX(-${card.form.length * 100}%)` }}
            >
              {card.form.map((match, i) => (
                <PastMatch key={i} match={match} clock={clock} />
              ))}
              {fixtures.length ? (
                fixtures.map((fixture, i) => (
                  <div key={`f${i}`} mix={pageStyles}>
                    <NextMatch fixture={fixture} label={i ? 'Then' : 'Next'} clock={clock} />
                  </div>
                ))
              ) : (
                <div mix={pageStyles}>
                  <span mix={infoStyles}>
                    <span mix={whenStyles}>Next</span>
                    <b>No upcoming matches</b>
                  </span>
                </div>
              )}
            </div>
          </div>
          <div aria-hidden='true' mix={dotsStyles}>
            {fixtures.map((_, i) => (
              <i key={i} data-dot data-on={i === 0 ? '' : undefined} mix={dotStyles} />
            ))}
          </div>
        </div>
      </article>
    );
  };
}

type PendingProps = { club: Club; failed: boolean; onRetry: () => void };

export function PendingClubCard(handle: Handle<PendingProps>) {
  return () => {
    const { club, failed, onRetry } = handle.props;

    return (
      <article mix={cardStyles} aria-busy={failed ? undefined : 'true'}>
        <Strip club={club}>
          <span mix={pillsStyles} aria-hidden='true'>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} mix={skeletonPillStyles} />
            ))}
          </span>
        </Strip>
        <div mix={[blockStyles, pendingBlockStyles]}>
          {failed ? (
            <>
              <span mix={infoStyles}>
                <b>Couldn't load matches</b>
              </span>
              <button type='button' mix={[retryStyles, on('click', onRetry)]}>
                Retry
              </button>
            </>
          ) : (
            <span mix={skeletonLineStyles} aria-label='Loading matches' />
          )}
        </div>
      </article>
    );
  };
}

function Strip(handle: Handle<{ club: Club; children?: RemixNode }>) {
  return () => {
    const { club, children } = handle.props;
    const competition = getCompetitionMetadata(club.competitionCode);

    return (
      <div mix={stripStyles}>
        <ClubCrest crest={club.crest} size={space(11)} />
        <span mix={idStyles}>
          <span mix={nameStyles}>
            <span>{club.name}</span>
          </span>
          {children}
        </span>
        <span mix={positionStyles}>
          <b>{ordinal(club.position)}</b>
          {competition.short}
        </span>
      </div>
    );
  };
}

function CompetitionMark(handle: Handle<{ code: string }>) {
  return () => {
    const { color, mark } = getCompetitionMetadata(handle.props.code);
    return (
      <span mix={markStyles} style={{ '--c': color }}>
        {mark}
      </span>
    );
  };
}

// Match details are a later pass; the button is here so a picked result already reads as tappable.
function PastMatch(handle: Handle<{ match: PlayedMatch; clock: Clock }>) {
  return () => {
    const { match, clock } = handle.props;
    const date = new Date(match.utcDate);

    return (
      <button type='button' data-r={match.result} mix={pastMatchStyles}>
        <span data-r={match.result} mix={scoreStyles}>
          {match.gf}–{match.ga}
        </span>
        <span mix={infoStyles}>
          <span mix={whenStyles}>
            {resultWord[match.result]} · {day(date, clock)} {shortDate(date, clock)}{' '}
            <CompetitionMark code={match.competition} />
          </span>
          <b>{versus(match.venue, match.opponent.name)}</b>
        </span>
        <ClubCrest crest={match.opponent.crest} size={space(7)} />
        <span mix={chevronStyles}>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2.6'
            stroke-linecap='round'
            stroke-linejoin='round'
            aria-hidden='true'
          >
            <path d='m9 6 6 6-6 6' />
          </svg>
        </span>
      </button>
    );
  };
}

function NextMatch(handle: Handle<{ fixture: Fixture; label: string; clock: Clock }>) {
  return () => {
    const { fixture, label, clock } = handle.props;
    const date = new Date(fixture.utcDate);

    return (
      <>
        <span mix={countStyles}>
          {countdown(date, clock).flatMap(([n, unit]) => [
            String(n),
            <small key={unit}>{unit}</small>,
          ])}
        </span>
        <span mix={infoStyles}>
          <span mix={whenStyles}>
            {label} · {day(date, clock)} {time(date, clock)}{' '}
            <CompetitionMark code={fixture.competition} />
          </span>
          <b>{versus(fixture.venue, fixture.opponent.name)}</b>
        </span>
        <ClubCrest crest={fixture.opponent.crest} size={space(7)} />
      </>
    );
  };
}

// ───────── styles (ported 1:1 from public/prototypes/match-cards) ─────────

const cardStyles = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  padding: space(3),
  borderRadius: v('--radius-lg'),
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
});

const stripStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
});

const idStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1.5),
  minWidth: 0,
});

const nameStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.5),
  minWidth: 0,
  fontSize: v('--text-base'),
  fontWeight: v('--font-weight-bold'),
  letterSpacing: v('--tracking-tight'),
  lineHeight: v('--leading-none'),

  '& > span': {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
});

const positionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: space(1),
  flex: 'none',
  fontSize: v('--text-2xs'),
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-text-tertiary'),

  '& b': {
    fontSize: v('--text-base'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    color: v('--color-text'),
  },
});

// ── form strip

// Padding grows the touch target to 36px without moving the layout.
const formStyles = css({
  position: 'relative',
  alignSelf: 'flex-start',
  margin: `${space(-2)} ${space(-1.5)}`,
  padding: `${space(2)} ${space(1.5)}`,
  touchAction: 'pan-y',
  cursor: 'ew-resize',
});

// The lens marks the pick. It stays after release, so the pick is always visible.
// At rest on now the ring is quiet; accent means "you've moved away from now".
const lensStyles = css({
  position: 'absolute',
  top: space(1),
  left: 0,
  height: space(7),
  borderRadius: space(2),
  boxShadow: `0 0 0 1.5px ${v('--color-accent')}`,
  opacity: 0,
  pointerEvents: 'none',
  transition: `opacity 180ms ${v('--ease-out')}, box-shadow 180ms ${v('--ease-out')}`,

  '[data-picked] &, [data-scrubbing] &': {
    opacity: 1,
  },

  '[data-scrubbing] &': {
    boxShadow: `0 0 0 1.5px ${v('--color-accent')}, 0 0 1rem color-mix(in oklab, ${v('--color-accent')} 35%, transparent)`,
    transitionDuration: '100ms',
  },

  '[data-now]:not([data-scrubbing]) &': {
    boxShadow: `0 0 0 1.5px ${v('--color-ring-rest')}`,
  },
});

const pillsStyles = css({
  position: 'relative',
  display: 'flex',
  gap: space(1),
});

const pillBase = {
  display: 'grid',
  placeItems: 'center',
  width: space(5),
  height: space(5),
  borderRadius: space(1.25),
  fontSize: v('--text-3xs'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-bg'),
  listStyle: 'none',

  '[data-scrubbing] &:not([data-lit])': {
    opacity: 0.45,
  },

  '[data-scrubbing] &[data-lit]': {
    transform: 'scale(1.12)',
  },
} as const;

const pillStyles = css({
  ...pillBase,
  transition: `transform 140ms ${v('--ease-out')}, opacity 140ms ${v('--ease-out')}`,

  '&[data-r="W"]': { background: v('--color-win') },
  '&[data-r="D"]': { background: v('--color-draw') },
  '&[data-r="L"]': { background: v('--color-loss') },
});

const nextPillStyles = css({
  ...pillBase,
  width: 'auto',
  marginLeft: space(1.5),
  padding: `0 ${space(1.75)}`,
  background: 'transparent',
  boxShadow: `inset 0 0 0 1px ${v('--color-outline')}`,
  fontSize: v('--text-4xs'),
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),
  transition: `color 160ms ${v('--ease-out')}, transform 140ms ${v('--ease-out')}, opacity 140ms ${v('--ease-out')}`,

  '&[data-lit]': {
    color: v('--color-accent'),
  },

  '[data-now]:not([data-scrubbing]) &[data-lit]': {
    color: v('--color-text'),
  },
});

// ── next-match block: one pager over results, then fixtures

const blockStyles = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  minHeight: space(14),
  padding: 0,
  overflow: 'hidden',
  borderRadius: v('--radius-md'),
  background: v('--color-well'),
});

const pagerStyles = css({
  width: '100%',
  overflow: 'hidden',
  touchAction: 'pan-y',
});

const trackStyles = css({
  display: 'flex',
  willChange: 'transform',
});

const page = {
  display: 'flex',
  flex: '0 0 100%',
  alignItems: 'center',
  gap: space(3),
  minWidth: 0,
  padding: `${space(2.5)} ${space(3)} ${space(3.5)}`,
} as const;

const pageStyles = css(page);

const pastMatchStyles = css({
  ...page,
  textAlign: 'left',
  transition: `transform 120ms ${v('--ease-out')}, background-color 120ms ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.985)',
  },

  '&:focus-visible': {
    outline: `2px solid ${v('--color-accent')}`,
    outlineOffset: '-2px',
    borderRadius: v('--radius-md'),
  },
});

const numeral = {
  flex: 'none',
  minWidth: space(17),
  fontSize: v('--text-xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
  fontVariantNumeric: 'tabular-nums',
} as const;

const countStyles = css({
  ...numeral,

  '& small': {
    margin: `0 ${space(0.5)}`,
    fontSize: v('--text-unit'),
    fontWeight: v('--font-weight-semibold'),
    color: v('--color-text-secondary'),
  },
});

const scoreStyles = css({
  ...numeral,

  '&[data-r="W"]': { color: v('--color-win') },
  '&[data-r="D"]': { color: v('--color-draw') },
  '&[data-r="L"]': { color: v('--color-loss') },
});

const infoStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1),
  minWidth: 0,
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),

  '& b': {
    overflow: 'hidden',
    fontSize: v('--text-sm'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: v('--color-text'),
  },
});

const whenStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.5),
  whiteSpace: 'nowrap',
});

const markStyles = css({
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: space(4.5),
  height: space(3.75),
  padding: `0 ${space(1)}`,
  borderRadius: space(1),
  background: 'var(--c)',
  fontSize: v('--text-4xs'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-white'),
  boxShadow: v('--shadow-mark'),
});

const chevronStyles = css({
  flex: 'none',
  width: space(4),
  height: space(4),
  marginLeft: space(-1),
  color: v('--color-text-tertiary'),

  '& svg': {
    width: '100%',
    height: '100%',
  },
});

// Fixture dots only make sense once you are in the future, because the strip shows one NEXT slot.
const dotsStyles = css({
  position: 'absolute',
  left: '50%',
  bottom: space(1.25),
  display: 'flex',
  gap: space(1),
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
  opacity: 0,
  transition: `opacity 180ms ${v('--ease-out')}`,

  '[data-future] &': {
    opacity: 1,
  },
});

const dotStyles = css({
  width: space(1),
  height: space(1),
  borderRadius: v('--radius-full'),
  background: v('--color-text-tertiary'),
  transition: `width 200ms ${v('--ease-out')}, background-color 200ms ${v('--ease-out')}`,

  '&[data-on]': {
    width: space(3),
    background: v('--color-text-secondary'),
  },
});

// ── pending

const skeletonPillStyles = css({
  width: space(5),
  height: space(5),
  borderRadius: space(1.25),
  background: v('--color-separator'),
});

const pendingBlockStyles = css({
  padding: `0 ${space(3)}`,
});

const skeletonLineStyles = css({
  '@keyframes club-card-pulse': {
    '50%': { opacity: 0.5 },
  },

  width: '55%',
  height: space(3),
  borderRadius: v('--radius-full'),
  background: v('--color-separator'),
  animation: `club-card-pulse 1.4s ${v('--ease-out')} infinite`,
});

const retryStyles = css({
  flex: 'none',
  margin: `${space(-2)} ${space(-1)} ${space(-2)} 0`,
  padding: space(2),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-bold'),
  color: v('--color-accent'),
  transition: `opacity 140ms ${v('--ease-out')}`,

  '&:active': {
    opacity: 0.5,
  },
});
