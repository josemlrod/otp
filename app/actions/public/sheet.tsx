import {
  css, on, ref, TypedEventTarget,
  type Dispatched, type Handle, type RemixNode,
} from 'remix/component';

import { hideScrollbar, space, v } from '../../ui/theme.ts';
import { clamp, rubber, tracker } from './motion.ts';
import { countRender } from './perf/renders.ts';
import { WIDE_QUERY } from './wide/layout.ts';

type SheetRequest = {
  /** Called on every render, so the content can follow the caller's state while open. */
  content: () => RemixNode;
  opener: HTMLElement;
  labelledBy?: string;
  onClose?: () => void;
};

/** One controller per Sheet host. Closing invokes the request's save hook exactly once. */
export class SheetController extends TypedEventTarget<{ change: Event }> {
  #request: SheetRequest | null = null;
  #open = false;

  get request() {
    return this.#request;
  }

  get open() {
    return this.#open;
  }

  show(request: SheetRequest) {
    if (this.open) this.close();
    this.#request = request;
    this.#open = true;
    this.dispatchEvent(new Event('change'));
  }

  close = () => {
    if (!this.open) return;
    this.#open = false;
    this.request?.onClose?.();
    this.dispatchEvent(new Event('change'));
  };
}

type Props = {
  controller: SheetController;
  focusFallback?: (screen: HTMLElement) => HTMLElement | null | undefined;
  children?: RemixNode;
};

type SheetPointerEvent = Dispatched<PointerEvent, HTMLElement>;

type GrabPress = {
  pointerId: number;
  startY: number;
  lastTimeStamp: number;
  isDragging: boolean;
  openFraction: number;
};

const MIN_DRAG_DISTANCE_PX = 6;
const FLICK_PROJECTION_MS = 220;
const STILL_FINGER_LOSES_FLICK_AFTER_MS = 100;
const CLOSED_OVERSHOOT_PX = 30;
const BACKDROP_OPEN_OPACITY = 0.45;

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
  if (controls.length === 0) {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    return;
  }
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
  let root: HTMLElement | undefined;
  let screen: HTMLElement | undefined;
  let frame = 0;
  const velocity = tracker();
  const controller = handle.props.controller;

  function cancelPaint() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function clearDrag() {
    cancelPaint();
    root?.style.removeProperty('--sheet-drag');
    root?.style.removeProperty('--sheet-pull');
  }

  controller.addEventListener('change', async () => {
    press = null;
    cancelPaint();
    const signal = await handle.update();
    if (signal.aborted) return;
    // Restore transition durations before removing the gesture's overrides.
    clearDrag();
    if (controller.open) {
      (sheet?.querySelector<HTMLElement>('[data-sheet-autofocus]') ?? sheet)
        ?.focus({ preventScroll: true });
    } else {
      const opener = controller.request?.opener;
      (opener?.isConnected ? opener : (screen && handle.props.focusFallback?.(screen)))
        ?.focus({ preventScroll: true });
    }
  }, { signal: handle.signal });
  handle.signal.addEventListener('abort', clearDrag, { once: true });

  function paintDrag() {
    frame = 0;
    if (!press?.isDragging) return;
    root?.style.setProperty('--sheet-drag', String(press.openFraction));
    const pull = pullDownPx < 0 ? rubber(pullDownPx, closedPullDownPx(), 0.2) : pullDownPx;
    root?.style.setProperty('--sheet-pull', `${pull}px`);
  }

  const closedPullDownPx = () => (sheet?.offsetHeight ?? 0) + CLOSED_OVERSHOOT_PX;

  function startPress(event: SheetPointerEvent) {
    if (!controller.open) return;
    if (event.button > 0 || !event.isPrimary) return;
    if (!canStartDrag(event.target)) return;
    velocity.reset(0, event.clientY, event.timeStamp);
    press = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastTimeStamp: event.timeStamp,
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
      handle.update();
    }
    velocity.add(0, event.clientY, event.timeStamp);
    press.lastTimeStamp = event.timeStamp;
    pullDownPx = travelPx;
    press.openFraction = clamp(1 - pullDownPx / closedPullDownPx(), 0, 1);
    if (!frame) frame = requestAnimationFrame(paintDrag);
  }

  function endPress(event: SheetPointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { isDragging, lastTimeStamp } = press;
    const velocityPxPerMs = velocity.velocity(lastTimeStamp).y / 1000;
    press = null;
    if (!isDragging) return;

    cancelPaint();
    const fingerWasStill =
      event.timeStamp - lastTimeStamp > STILL_FINGER_LOSES_FLICK_AFTER_MS;
    const flickVelocity = fingerWasStill ? 0 : velocityPxPerMs;
    const projectedPullDownPx = pullDownPx + flickVelocity * FLICK_PROJECTION_MS;
    pullDownPx = 0;

    if (projectedPullDownPx > closedPullDownPx() / 2) {
      controller.close();
    } else {
      handle.update().then((signal) => {
        if (!signal.aborted && !press?.isDragging) clearDrag();
      });
    }
  }

  return () => {
    countRender('Sheet');
    const { open, request } = controller;
    const labelledBy = request?.labelledBy;
    const children = request?.content();
    const onClose = controller.close;
    const isDragging = open && !!press?.isDragging;
    const openFraction = open ? 1 : 0;
    const restingTransform = open ? 'translateY(0)' : 'translateY(110%)';

    return (
      <div
        mix={[containerStyles, ref((node) => { root = node; })]}
        style={{
          '--sheet-open': openFraction,
          '--sheet-duration': isDragging
            ? '0ms'
            : v(open ? '--duration-sheet-open' : '--duration-sheet-close'),
        }}
      >
        <main mix={[screenStyles, ref((node) => { screen = node; })]} inert={open}>
          {handle.props.children}
        </main>
        <button
          type='button'
          aria-label='Close sheet'
          tabIndex={-1}
          inert={!open}
          mix={[backdrop, on('click', onClose)]}
          style={{
            opacity: `calc(var(--sheet-drag, var(--sheet-open)) * ${BACKDROP_OPEN_OPACITY})`,
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
              if (!controller.open) return;

              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                controller.close();
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
              ? 'translateY(var(--sheet-pull, 0px))'
              : restingTransform,
            transitionDuration: isDragging ? '0ms' : undefined,
          }}
        >
          <span mix={sheetHandle} aria-hidden='true' />
          {children}
        </section>
      </div>
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

  // On a wide display the sheet keeps a phone's width, centred over the screen.
  [`@media ${WIDE_QUERY}`]: {
    left: 'max(0px, calc((100% - 40rem) / 2))',
    right: 'max(0px, calc((100% - 40rem) / 2))',
  },
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

const containerStyles = css({
  position: 'fixed',
  inset: 0,
  isolation: 'isolate',
  overflow: 'hidden',
  background: v('--color-black'),
});

// The screen behind the sheet recedes to 93% scale and gains rounded corners as the sheet opens.
const screenStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  height: '100%',
  overflow: 'clip',
  background: v('--color-bg'),
  transformOrigin: '50% 0',
  transform: 'scale(calc(1 - var(--sheet-drag, var(--sheet-open)) * 0.07))',
  borderRadius: `calc(${v('--radius-lg')} * var(--sheet-drag, var(--sheet-open)))`,
  transitionProperty: 'transform, border-radius',
  transitionDuration: 'var(--sheet-duration)',
  transitionTimingFunction: v('--ease-ios'),
});
