import { css, on, ref, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { countRender } from '../perf/renders.ts';
import { StandingsTable } from './standings-table.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse | null;
  open: boolean;
  onClose: () => void;
  // Reports how open the sheet is while it's being dragged (1 = open,
  // 0 = closed) so the layers behind it can follow; `null` when released.
  onDrag?: (progress: number | null) => void;
  closeButtonRef?: (button: HTMLButtonElement) => void;
};

// How far the finger must travel before a press on the grab area becomes a drag.
const DRAG_THRESHOLD = 6;
// How far ahead (in ms of the current velocity) to project a flick on release.
const FLICK_PROJECTION = 220;
// A finger held still this long before lifting has no flick left in it.
const VELOCITY_STALE_AFTER = 100;

export function Sheet(handle: Handle<Props>) {
  const titleId = `${handle.id}-title`;
  let sheet: HTMLElement | undefined;

  // A press on the grab area. It only becomes `active` once it passes the
  // threshold, so taps and small jitters never move the sheet. `velocity` is
  // in px/ms, measured between the last two moves.
  let drag: {
    pointerId: number;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    active: boolean;
  } | null = null;
  // How far the sheet is pulled down from fully open, in px.
  let offset = 0;

  // The offset at which the sheet is fully closed: just past the bottom edge.
  const closedOffset = () => (sheet?.offsetHeight ?? 0) + 30;

  // Settle on whichever detent the flick is heading toward: back to open, or
  // closed (just past the bottom of the screen).
  function endDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { active, velocity, lastT } = drag;
    drag = null;
    if (!active) return;

    handle.props.onDrag?.(null);
    const flick = event.timeStamp - lastT > VELOCITY_STALE_AFTER ? 0 : velocity;
    const projected = offset + flick * FLICK_PROJECTION;
    offset = 0;

    if (projected > closedOffset() / 2) {
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
    const dragging = open && !!drag?.active;

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

            if (event.key === 'Tab') {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'a[href], button, input, select, textarea, [tabindex]',
                ),
              ).filter((element) =>
                element.tabIndex >= 0 &&
                !element.matches(':disabled') &&
                !element.closest('[inert]') &&
                element.getClientRects().length > 0 &&
                getComputedStyle(element).visibility === 'visible'
              );
              const first = controls[0];
              const last = controls.at(-1);
              // The sheet itself takes focus when pressed outside any control.
              const atStart =
                document.activeElement === first ||
                document.activeElement === event.currentTarget;

              if (event.shiftKey && atStart) {
                event.preventDefault();
                last?.focus({ preventScroll: true });
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus({ preventScroll: true });
              }
            }
          }),
        ]}
        role='dialog'
        aria-modal='true'
        // Pressing a non-focusable part of the sheet (the band, the table)
        // focuses the sheet instead of <body>, so Escape keeps working.
        tabIndex={-1}
        aria-labelledby={standing ? titleId : undefined}
        aria-hidden={!open || !standing ? 'true' : 'false'}
        inert={!open || !standing}
        style={{
          // Pulling above the top only gives a little (rubber band).
          transform: dragging
            ? `translateY(${offset < 0 ? offset * 0.2 : offset}px)`
            : open
              ? 'translateY(0)'
              : 'translateY(110%)',
          // Follow the finger exactly; the CSS transition resumes on release.
          transitionDuration: dragging ? '0ms' : undefined,
        }}
      >
        {standing && metadata && (
          <div
            mix={[
              sheetGrab,
              on('pointerdown', (event) => {
                if (event.button > 0 || !event.isPrimary) return;
                if ((event.target as Element).closest('button')) return;
                drag = {
                  pointerId: event.pointerId,
                  startY: event.clientY,
                  lastY: event.clientY,
                  lastT: event.timeStamp,
                  velocity: 0,
                  active: false,
                };
              }),
              on('pointermove', (event) => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                const dy = event.clientY - drag.startY;
                if (!drag.active) {
                  if (Math.abs(dy) < DRAG_THRESHOLD) return;
                  drag.active = true;
                  // Keep receiving moves even when the finger leaves the grab area.
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                drag.velocity =
                  (event.clientY - drag.lastY) /
                  Math.max(1, event.timeStamp - drag.lastT);
                drag.lastY = event.clientY;
                drag.lastT = event.timeStamp;
                offset = dy;
                handle.props.onDrag?.(
                  Math.min(1, Math.max(0, 1 - offset / closedOffset())),
                );
                handle.update();
              }),
              on('pointerup', (event) => endDrag(event)),
              on('pointercancel', (event) => endDrag(event)),
            ]}
            style={{ cursor: dragging ? 'grabbing' : undefined }}
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
                <span>
                  {standing.competition.code === 'CL'
                    ? 'League phase'
                    : 'Matchday'}{' '}
                  {standing.season.currentMatchday}
                  {metadata.rounds != null && ` of ${metadata.rounds}`}
                </span>
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
  // A mouse drag would otherwise select the title as it moves.
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
