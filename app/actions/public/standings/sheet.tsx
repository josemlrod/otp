import { css, on, ref, type Dispatched, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
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
};

const MIN_DRAG_DISTANCE_PX = 6;
const FLICK_PROJECTION_MS = 220;
const STILL_FINGER_LOSES_FLICK_AFTER_MS = 100;
const CLOSED_OVERSHOOT_PX = 30;
const RUBBER_BAND_RESISTANCE = 0.2;

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
    handle.props.onDragOpenFraction?.(clamp01(1 - pullDownPx / closedPullDownPx()));
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
    const restingTransform = open ? 'translateY(0)' : 'translateY(110%)';

    return (
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
                '--c': metadata.color,
                '--ink': '#fff',
                '--ca': metadata.accent,
              }}
            >
              <span mix={competitionBadge}>
                <span
                  class='cmark'
                  mix={competitionMark}
                  style={{ '--cm': metadata.color, '--s': '34px' }}
                  aria-hidden='true'
                >
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
                  width='16'
                  height='16'
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
          <div mix={sheetScroll} tabIndex={0}>
            <StandingsTable standing={standing} />
          </div>
        )}
      </section>
    );
  };
}

const sheetContainer = css({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 'calc(var(--safe-top, var(--safe-area-inset-top, 0px)) + 10px)',
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: '18px 18px 0 0',
  background: 'var(--surface)',
  boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
  transform: 'translateY(110%)',
  transitionProperty: 'transform',
  transitionDuration: 'var(--sheet-duration, 480ms)',
  transitionTimingFunction: 'var(--ease-ios)',
  touchAction: 'auto',
  willChange: 'transform',
  '--surface-in': 'var(--surface-2)',

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
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
  top: 6,
  left: '50%',
  zIndex: 2,
  width: 36,
  height: 5,
  borderRadius: 3,
  background: 'rgba(255, 255, 255, 0.45)',
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
  scrollbarWidth: 'none',
  paddingBottom:
    'calc(var(--safe-bottom, var(--safe-area-inset-bottom, 0px)) + 24px)',

  '&::-webkit-scrollbar': {
    display: 'none',
  },
});

const sheetBand = css({
  position: 'relative',
  flexShrink: 0,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '22px 16px 16px',
  color: 'var(--ink)',
  background: `linear-gradient(
    165deg,
    color-mix(in oklab, var(--c) 82%, white) 0px,
    var(--c) 120px,
    color-mix(in oklab, var(--c) 72%, black) 360px
  )`,
});

const competitionBadge = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: 50,
  height: 50,
  borderRadius: '50%',
  background: 'none',
  boxShadow: 'none',

  '& .cmark': {
    boxShadow: `
      inset 0 0 0 1px rgba(255, 255, 255, 0.25),
      0 4px 12px rgba(0, 0, 0, 0.3)
    `,
  },
});

const sheetTitle = css({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,

  '& b': {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },

  '& > span': {
    fontSize: 13,
    opacity: 0.75,
  },
});

const sheetClose = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: 34,
  height: 34,
  borderRadius: '50%',
  background: 'color-mix(in srgb, var(--ink) 18%, transparent)',
  transition: 'transform 120ms ease-out',

  '&:active': {
    transform: 'scale(0.9)',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:active': {
      transform: 'none',
    },
  },

  '& svg': {
    width: 16,
    height: 16,
  },

  '&[aria-pressed="true"] svg': {
    fill: 'currentColor',
  },

  font: 'inherit',
  color: 'inherit',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  touchAction: 'manipulation',
});

const competitionMark = css({
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--s)',
  height: 'var(--s)',
  borderRadius: 'calc(var(--s) * 0.3)',
  background: 'var(--cm)',
  color: 'var(--ca)',
  fontSize: 'calc(var(--s) * 0.44)',
  fontWeight: 850,
  fontStyle: 'normal',
  letterSpacing: '-0.02em',
  lineHeight: 1,
  boxShadow: 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.22)',
});
