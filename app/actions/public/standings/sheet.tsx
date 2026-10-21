import { css, on, ref, type Dispatched, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { hideScrollbar, space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { StandingsTable } from './standings-table.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse | null;
  open: boolean;
  onClose: () => void;
  onDragOpenFraction?: (openFraction: number | null) => void;
  closeButtonRef?: (button: HTMLButtonElement) => void;
};

type GrabPointerEvent = Dispatched<PointerEvent, HTMLDivElement>;

type GrabPress = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTimeStamp: number;
  velocityPxPerMs: number;
  isDragging: boolean;
  openFraction: number;
};

const MIN_DRAG_DISTANCE_PX = 6;
const FLICK_PROJECTION_MS = 220;
const STILL_FINGER_LOSES_FLICK_AFTER_MS = 100;
const CLOSED_OVERSHOOT_PX = 30;
const RUBBER_BAND_RESISTANCE = 0.2;
const BACKDROP_OPEN_OPACITY = 0.45;

function rubberBand(pullDownPx: number) {
  return pullDownPx < 0 ? pullDownPx * RUBBER_BAND_RESISTANCE : pullDownPx;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function focusableControls(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ),
  ).filter((element) =>
    element.tabIndex >= 0 &&
    !element.matches(':disabled') &&
    !element.closest('[inert]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible'
  );
}

function trapTabFocus(event: Dispatched<KeyboardEvent, HTMLElement>) {
  const controls = focusableControls(event.currentTarget);
  const first = controls[0];
  const last = controls.at(-1);
  const focused = document.activeElement;
  const isAtStart = focused === first || focused === event.currentTarget;

  if (event.shiftKey && isAtStart) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && focused === last) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
}

function matchdayLabel(standing: StandingsResponse, leaguePhaseRounds?: number) {
  const phase = standing.competition.code === 'CL' ? 'League phase' : 'Matchday';
  const ofRounds = leaguePhaseRounds == null ? '' : ` of ${leaguePhaseRounds}`;
  return `${phase} ${standing.season.currentMatchday}${ofRounds}`;
}

export function Sheet(handle: Handle<Props>) {
  const titleId = `${handle.id}-title`;
  let sheet: HTMLElement | undefined;
  let press: GrabPress | null = null;
  let pullDownPx = 0;

  const closedPullDownPx = () => (sheet?.offsetHeight ?? 0) + CLOSED_OVERSHOOT_PX;

  function startPress(event: GrabPointerEvent) {
    if (event.button > 0 || !event.isPrimary) return;
    if ((event.target as Element).closest('button')) return;
    press = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTimeStamp: event.timeStamp,
      velocityPxPerMs: 0,
      isDragging: false,
      openFraction: 1,
    };
  }

  function movePress(event: GrabPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const travelPx = event.clientY - press.startY;
    if (!press.isDragging) {
      if (Math.abs(travelPx) < MIN_DRAG_DISTANCE_PX) return;
      press.isDragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    press.velocityPxPerMs =
      (event.clientY - press.lastY) /
      Math.max(1, event.timeStamp - press.lastTimeStamp);
    press.lastY = event.clientY;
    press.lastTimeStamp = event.timeStamp;
    pullDownPx = travelPx;
    press.openFraction = clamp01(1 - pullDownPx / closedPullDownPx());
    handle.props.onDragOpenFraction?.(press.openFraction);
    handle.update();
  }

  function endPress(event: GrabPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { isDragging, velocityPxPerMs, lastTimeStamp } = press;
    press = null;
    if (!isDragging) return;

    handle.props.onDragOpenFraction?.(null);
    const fingerWasStill =
      event.timeStamp - lastTimeStamp > STILL_FINGER_LOSES_FLICK_AFTER_MS;
    const flickVelocity = fingerWasStill ? 0 : velocityPxPerMs;
    const projectedPullDownPx = pullDownPx + flickVelocity * FLICK_PROJECTION_MS;
    pullDownPx = 0;

    if (projectedPullDownPx > closedPullDownPx() / 2) {
      handle.props.onClose();
    } else {
      handle.update();
    }
  }

  return () => {
    countRender('Sheet');
    const { open, standing, onClose } = handle.props;
    const metadata = standing
      ? getCompetitionMetadata(standing.competition.code)
      : null;
    const isDragging = open && !!press?.isDragging;
    const openFraction = isDragging ? press!.openFraction : open ? 1 : 0;
    const restingTransform = open ? 'translateY(0)' : 'translateY(110%)';

    return (
      <>
        <button
          type='button'
          aria-label='Close standings'
          tabIndex={-1}
          inert={!open}
          mix={[backdrop, on('click', onClose)]}
          style={{
            opacity: openFraction * BACKDROP_OPEN_OPACITY,
            pointerEvents: open ? 'auto' : 'none',
          }}
        />
        <section
          mix={[
            sheetContainer,
            ref((node) => {
              sheet = node;
            }),
            on('keydown', (event) => {
              if (!handle.props.open) return;

              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handle.props.onClose();
              }

              if (event.key === 'Tab') trapTabFocus(event);
            }),
          ]}
          role='dialog'
          aria-modal='true'
          tabIndex={-1}
          aria-labelledby={standing ? titleId : undefined}
          aria-hidden={!open || !standing ? 'true' : 'false'}
          inert={!open || !standing}
          style={{
            transform: isDragging
              ? `translateY(${rubberBand(pullDownPx)}px)`
              : restingTransform,
            transitionDuration: isDragging ? '0ms' : undefined,
          }}
        >
          {standing && metadata && (
            <div
              mix={[
                sheetGrab,
                on('pointerdown', startPress),
                on('pointermove', movePress),
                on('pointerup', endPress),
                on('pointercancel', endPress),
              ]}
              style={{ cursor: isDragging ? 'grabbing' : undefined }}
            >
              <span mix={sheetHandle} aria-hidden='true' />
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
                  mix={[
                    sheetClose,
                    ref((button) => handle.props.closeButtonRef?.(button)),
                    on('click', onClose),
                  ]}
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
          )}
          {standing && (
            <div mix={[sheetScroll, hideScrollbar]} tabIndex={0}>
              <StandingsTable standing={standing} />
            </div>
          )}
        </section>
      </>
    );
  };
}

const backdrop = css({
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  background: v('--color-black'),
  transitionProperty: 'opacity',
  transitionDuration: `var(--sheet-duration, ${v('--duration-sheet-open')})`,
  transitionTimingFunction: v('--ease-ios'),
});

const sheetContainer = css({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: `calc(${v('--safe-area-inset-top')} + ${space(2.5)})`,
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: `${v('--radius-lg')} ${v('--radius-lg')} 0 0`,
  background: v('--color-surface'),
  boxShadow: v('--shadow-sheet'),
  transform: 'translateY(110%)',
  transitionProperty: 'transform',
  transitionDuration: `var(--sheet-duration, ${v('--duration-sheet-open')})`,
  transitionTimingFunction: v('--ease-ios'),
  touchAction: 'auto',
  willChange: 'transform',
});

const sheetGrab = css({
  position: 'relative',
  flex: 'none',
  touchAction: 'none',
  cursor: 'grab',
  userSelect: 'none',
});

const sheetHandle = css({
  position: 'absolute',
  top: space(1.5),
  left: '50%',
  zIndex: 2,
  width: space(9),
  height: space(1.25),
  borderRadius: v('--radius-full'),
  background: v('--color-grabber'),
  transform: 'translateX(-50%)',
});

const sheetScroll = css({
  position: 'relative',
  flex: '1 1 0%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  touchAction: 'pan-y',
  overscrollBehavior: 'contain',
  paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(6)})`,
});

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

const competitionMark = css({
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
