import { css, on, ref, type Dispatched, type Handle, type RemixNode } from 'remix/component';

import { hideScrollbar, space, v } from '../../ui/theme.ts';
import { countRender } from './perf/renders.ts';

type Props = {
  open: boolean;
  labelledBy?: string;
  onClose: () => void;
  onDragOpenFraction?: (openFraction: number | null) => void;
  children?: RemixNode;
};

type SheetPointerEvent = Dispatched<PointerEvent, HTMLElement>;

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

function canStartDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('button, input, [data-no-drag]')) return false;
  return !!target.closest('[data-sheet-grab]');
}

export function Sheet(handle: Handle<Props>) {
  let sheet: HTMLElement | undefined;
  let press: GrabPress | null = null;
  let pullDownPx = 0;

  const closedPullDownPx = () => (sheet?.offsetHeight ?? 0) + CLOSED_OVERSHOOT_PX;

  function startPress(event: SheetPointerEvent) {
    if (event.button > 0 || !event.isPrimary) return;
    if (!canStartDrag(event.target)) return;
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

  function movePress(event: SheetPointerEvent) {
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

  function endPress(event: SheetPointerEvent) {
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
    const { open, labelledBy, onClose, children } = handle.props;
    const isDragging = open && !!press?.isDragging;
    const openFraction = isDragging ? press!.openFraction : open ? 1 : 0;
    const restingTransform = open ? 'translateY(0)' : 'translateY(110%)';

    return (
      <>
        <button
          type='button'
          aria-label='Close sheet'
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
            on('pointerdown', startPress),
            on('pointermove', movePress),
            on('pointerup', endPress),
            on('pointercancel', endPress),
          ]}
          role='dialog'
          aria-modal='true'
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-hidden={!open || !children ? 'true' : 'false'}
          inert={!open || !children}
          data-dragging={isDragging ? 'true' : undefined}
          style={{
            transform: isDragging
              ? `translateY(${rubberBand(pullDownPx)}px)`
              : restingTransform,
            transitionDuration: isDragging ? '0ms' : undefined,
          }}
        >
          <span mix={sheetHandle} aria-hidden='true' />
          {children}
        </section>
      </>
    );
  };
}

export const sheetGrab = css({
  position: 'relative',
  flex: 'none',
  touchAction: 'none',
  cursor: 'grab',
  userSelect: 'none',

  '[data-dragging] &': {
    cursor: 'grabbing',
  },
});

export const sheetScroll = [
  hideScrollbar,
  css({
    position: 'relative',
    flex: '1 1 0%',
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
    paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(6)})`,
  }),
];

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
  pointerEvents: 'none',
});
