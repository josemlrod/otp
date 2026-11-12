import { css, ref, type Handle } from 'remix/component';
import type { OpenMatch } from '../match/match-sheet.tsx';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import { findStanding } from '../../../lib/standings.ts';
import type { StandingsResponse } from '../../../lib/types/api.ts';
import { space, v } from '../../../ui/theme.ts';
import type { MatchesModel } from '../clubs/matches.ts';
import { motionTime, SPRING, Value, blockScrollWhile, clamp, rubber, tracker, type Tracker } from '../motion.ts';
import { countRender } from '../perf/renders.ts';
import { ClubPage } from './club-page.tsx';
import { CompetitionPage } from './competition-page.tsx';
import { RAIL_PX, Sidebar, paintSidebar } from './sidebar.tsx';
import { selectionKey, type Selection } from './selection.ts';

// The home screen on wide displays (an unfolded iPhone Duo, an iPad). The sidebar never takes
// width from the content: at rest it's a rail of crests; pull it out and it floats over the
// content at whatever width you leave it, while the content dims and recedes behind it. Picking
// something puts it away. One value, the panel's width, drives the panel, its corners, the scrim
// and the content's recession, so they can't drift apart mid-gesture.

const MIN_OPEN_PX = 240;
const DEFAULT_OPEN_PX = 300;
const CLOSE_BELOW_PX = 160;
const FLICK_PX_PER_S = 500;
const CLAIM_PX = 8;
const RECEDE = 0.025;
const SCRIM_OPACITY = 0.45;
const PAGE_LEAVE_MS = 160;
const WIDTH_KEY = 'otp.sidebarWidth';

const progress = (value: number, from: number, to: number) => clamp((value - from) / (to - from), 0, 1);

function readWidth() {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_OPEN_PX;
  } catch {
    return DEFAULT_OPEN_PX;
  }
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
  } catch {}
}

type Props = {
  clubs: Club[];
  standings: StandingsResponse[];
  matches: MatchesModel;
  clock: Clock;
  onEdit: (button: HTMLButtonElement) => void;
  onOpenMatch?: OpenMatch;
};

type Page = { id: number; key: string; selection: Selection; state: 'enter' | 'shown' | 'leave' };

type Drag = {
  pointerId: number;
  x0: number;
  y0: number;
  start: number;
  velocity: Tracker;
  claimed: boolean;
  moved: boolean;
  surface: 'grip' | 'panel' | 'scrim';
  target: HTMLElement;
};

export function WideHome(handle: Handle<Props>) {
  let selection: Selection | null = null;
  let pages: Page[] = [];
  let pageIds = 0;

  let root: HTMLElement | undefined;
  let panel: HTMLElement | undefined;
  let pane: HTMLElement | undefined;
  let scrim: HTMLElement | undefined;
  let grip: HTMLElement | undefined;
  const edges: HTMLElement[] = [];

  let max = 420;
  let lastOpen = readWidth();
  let returnFocus: Element | null = null;
  let drag: Drag | null = null;
  let swallowClick = false;
  let open = false;

  handle.props.matches.addEventListener('change', () => handle.update(), { signal: handle.signal });

  // ── one value: the panel's width
  const width = new Value(RAIL_PX, draw);
  handle.signal.addEventListener('abort', () => width.stop());

  function draw(value: number) {
    if (!panel || !pane || !scrim || !grip) return;
    const p = progress(value, RAIL_PX + 4, Math.max(lastOpen, MIN_OPEN_PX));
    paintSidebar(panel, value);
    panel.style.borderRadius = `0 calc(${v('--radius-xl')} * ${p}) calc(${v('--radius-xl')} * ${p}) 0`;
    panel.toggleAttribute('data-floating', value > RAIL_PX + 2);
    grip.style.transform = `translate3d(${value}px, 0, 0)`;
    scrim.style.opacity = String(p * SCRIM_OPACITY);
    pane.style.transform = p ? `scale(${1 - p * RECEDE})` : '';
    pane.style.borderRadius = p ? `calc(${v('--radius-lg')} * ${p})` : '';
    const isOut = value > RAIL_PX + CLAIM_PX;
    if (isOut !== open) setOpen(isOut);
  }

  function setOpen(next: boolean) {
    open = next;
    scrim?.toggleAttribute('data-on', next);
    grip?.setAttribute('aria-expanded', String(next));
    if (pane) pane.inert = next;
    for (const edge of edges) edge.hidden = next;
  }

  const isOpen = () => width.target > RAIL_PX + CLAIM_PX;

  function openTo(target: number, { velocity = 0 } = {}) {
    if (!isOpen()) returnFocus = document.activeElement;
    lastOpen = clamp(target, MIN_OPEN_PX, max);
    saveWidth(lastOpen);
    return width.to(lastOpen, { velocity, spring: velocity ? SPRING.release : SPRING.settle });
  }

  function close({ velocity = 0, refocus = true } = {}) {
    const was = isOpen();
    width.to(RAIL_PX, { velocity, spring: velocity ? SPRING.release : SPRING.settle });
    if (was && refocus) {
      const target = returnFocus instanceof HTMLElement && returnFocus.isConnected ? returnFocus : grip;
      target?.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  function measureMax() {
    const available = root?.clientWidth ?? 0;
    max = Math.max(MIN_OPEN_PX + 40, Math.min(420, available - 120));
    lastOpen = clamp(lastOpen, MIN_OPEN_PX, max);
    if (isOpen()) width.set(clamp(width.value, MIN_OPEN_PX, max));
    draw(width.value);
  }

  // ── gesture: the grip, a sideways drag on the panel, or (while open) on the dimmed content
  function start(event: PointerEvent, surface: Drag['surface']) {
    if (event.button > 0 || !event.isPrimary) return;
    if (surface === 'scrim' && !isOpen()) return;
    const velocity = tracker();
    velocity.reset(event.clientX, event.clientY, event.timeStamp);
    const caught = width.animating;
    width.stop(); // catch it mid-flight
    drag = {
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      start: width.value,
      velocity,
      claimed: caught || surface === 'grip',
      moved: false,
      surface,
      target: event.currentTarget as HTMLElement,
    };
    if (drag.claimed) claim(event);
  }

  function claim(event: PointerEvent) {
    if (!drag) return;
    drag.claimed = true;
    drag.target.setPointerCapture(event.pointerId);
    root?.setAttribute('data-dragging', '');
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.velocity.add(event.clientX, event.clientY, event.timeStamp);
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.claimed) {
      if (Math.abs(dy) > CLAIM_PX && Math.abs(dy) > Math.abs(dx)) {
        drag = null; // a scroll
        return;
      }
      if (Math.abs(dx) < CLAIM_PX) return;
      drag.x0 = event.clientX;
      drag.start = width.value;
      claim(event);
      return;
    }
    drag.moved = true;
    const raw = drag.start + (event.clientX - drag.x0);
    width.set(
      raw < RAIL_PX ? RAIL_PX + rubber(raw - RAIL_PX, 80) : raw > max ? max + rubber(raw - max, 120) : raw,
    );
  }

  function end(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { claimed, moved, velocity, surface } = drag;
    drag = null;
    root?.removeAttribute('data-dragging');
    if (!claimed) return;
    if (moved && surface === 'panel') {
      // Swallow the click that ends a drag started on an item.
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
    }
    if (!moved) {
      // A tap: the grip toggles; the dimmed content closes; a caught panel finishes its trip.
      if (surface === 'grip') return void (isOpen() ? close() : openTo(lastOpen));
      if (surface === 'scrim') return void close();
      return void width.to(width.target, { spring: SPRING.snap });
    }
    const vx = event.type === 'pointerup' ? velocity.velocity(event.timeStamp).x : 0;
    const now = width.value;
    if (vx < -FLICK_PX_PER_S || (vx <= FLICK_PX_PER_S && now + vx * 0.2 < CLOSE_BELOW_PX)) {
      return void close({ velocity: vx });
    }
    // A flick out opens to your width; otherwise it stays where you let go.
    openTo(vx > FLICK_PX_PER_S ? Math.max(now, lastOpen) : now, { velocity: vx });
  }

  function surface(node: HTMLElement, signal: AbortSignal, name: Drag['surface']) {
    node.addEventListener('pointerdown', (event) => start(event, name), { signal });
    node.addEventListener('pointermove', move, { signal });
    node.addEventListener('pointerup', end, { signal });
    node.addEventListener('pointercancel', end, { signal });
  }

  function onGripKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 80 : 24;
    if (event.key === 'Enter' || event.key === ' ') {
      if (isOpen()) close();
      else openTo(lastOpen);
    } else if (event.key === 'ArrowRight') {
      openTo(isOpen() ? width.target + step : lastOpen);
    } else if (event.key === 'ArrowLeft') {
      if (isOpen() && width.target - step >= MIN_OPEN_PX) openTo(width.target - step);
      else close();
    } else {
      return;
    }
    event.preventDefault();
  }

  // ── selection: picking from the panel puts it away
  function select(next: Selection) {
    if (swallowClick) return;
    selection = next;
    handle.update();
    if (isOpen()) close({ refocus: false });
  }

  // ── scroll edges: content dissolves under the top and bottom, as it does on the phone
  let frame = 0;
  function updateEdges() {
    frame = 0;
    if (!pane || edges.length < 2) return;
    const top = pane.scrollTop;
    const end = pane.scrollHeight - pane.clientHeight;
    edges[0]!.toggleAttribute('data-on', top > 2);
    edges[1]!.toggleAttribute('data-on', top < end - 2);
  }
  const scheduleEdges = () => {
    if (!frame) frame = requestAnimationFrame(updateEdges);
  };
  const resizes = new ResizeObserver(scheduleEdges);
  handle.signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    resizes.disconnect();
  });

  function current(): Selection {
    const { clubs, standings } = handle.props;
    const valid =
      selection &&
      (selection.kind === 'club'
        ? clubs.some((club) => club.id === (selection as { id: number }).id)
        : !!findStanding(standings, selection.code));
    if (valid) return selection!;
    selection = { kind: 'club', id: clubs[0]!.id };
    return selection;
  }

  // A new page fades up over the old one, which fades out underneath and is then dropped.
  function syncPages(next: Selection) {
    const key = selectionKey(next);
    if (pages.at(-1)?.key === key) return;
    const first = pages.length === 0;
    const id = ++pageIds;
    pages = [
      ...pages.map((page) => ({ ...page, state: 'leave' as const })),
      { id, key, selection: next, state: first ? 'shown' : 'enter' },
    ];
    if (first) return;
    handle.queueTask(() => {
      if (pane) pane.scrollTop = 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          pages = pages.map((page) => (page.id === id && page.state === 'enter' ? { ...page, state: 'shown' } : page));
          handle.update();
        }),
      );
      motionTime.after(PAGE_LEAVE_MS, () => {
        pages = pages.filter((page) => page.state !== 'leave');
        handle.update();
      });
    });
  }

  handle.queueTask(() => {
    measureMax();
    width.set(RAIL_PX);
    draw(RAIL_PX);
  });

  return () => {
    countRender('WideHome');
    const { clubs, standings, matches, clock, onEdit, onOpenMatch } = handle.props;
    const shown = current();
    syncPages(shown);

    return (
      <div
        mix={[
          rootStyles,
          ref((node, signal) => {
            root = node;
            // Measure on the next frame, so the writes it makes don't land inside the observer.
            let pending = 0;
            const observer = new ResizeObserver(() => {
              if (!pending) pending = requestAnimationFrame(() => ((pending = 0), measureMax()));
            });
            observer.observe(node);
            signal.addEventListener('abort', () => (cancelAnimationFrame(pending), observer.disconnect()));
            node.ownerDocument.defaultView?.addEventListener(
              'keydown',
              (event) => {
                if (event.key === 'Escape' && isOpen()) {
                  event.preventDefault();
                  close();
                }
              },
              { signal },
            );
          }),
        ]}
      >
        <Sidebar
          clubs={clubs}
          standings={standings}
          matches={matches}
          clock={clock}
          selection={shown}
          onSelect={select}
          onEdit={onEdit}
          setElement={(node) => {
            if (panel === node) return;
            panel = node;
            surface(node, handle.signal, 'panel');
            blockScrollWhile(node, () => !!drag?.claimed, handle.signal);
          }}
        />
        <div
          data-detail
          mix={[
            paneStyles,
            ref((node, signal) => {
              pane = node;
              node.addEventListener('scroll', scheduleEdges, { passive: true, signal });
              resizes.observe(node);
            }),
          ]}
        >
          {pages.map((page) => (
            <div
              key={page.id}
              data-page={page.key}
              data-enter={page.state === 'enter' ? '' : undefined}
              data-leave={page.state === 'leave' ? '' : undefined}
              inert={page.state === 'leave'}
              mix={[
                pageStyles,
                ref((node, signal) => {
                  resizes.observe(node);
                  signal.addEventListener('abort', () => resizes.unobserve(node));
                }),
              ]}
            >
              <PageContent
                selection={page.selection}
                clubs={clubs}
                standings={standings}
                matches={matches}
                clock={clock}
                onSelect={select}
                onOpenMatch={onOpenMatch}
              />
            </div>
          ))}
        </div>
        <span data-side='top' aria-hidden='true' mix={[edgeStyles, ref((node) => (edges[0] = node))]} />
        <span data-side='bottom' aria-hidden='true' mix={[edgeStyles, ref((node) => (edges[1] = node))]} />
        <div
          aria-hidden='true'
          mix={[
            scrimStyles,
            ref((node, signal) => {
              scrim = node;
              surface(node, signal, 'scrim');
            }),
          ]}
        />
        <div
          role='separator'
          aria-orientation='vertical'
          aria-label='Sidebar'
          tabIndex={0}
          mix={[
            gripStyles,
            ref((node, signal) => {
              grip = node;
              node.setAttribute('aria-expanded', 'false');
              surface(node, signal, 'grip');
              node.addEventListener('keydown', onGripKey, { signal });
            }),
          ]}
        >
          <i />
        </div>
      </div>
    );
  };
}

type PageProps = {
  selection: Selection;
  clubs: Club[];
  standings: StandingsResponse[];
  matches: MatchesModel;
  clock: Clock;
  onSelect: (selection: Selection) => void;
  onOpenMatch?: OpenMatch;
};

function PageContent(handle: Handle<PageProps>) {
  return () => {
    const { selection, clubs, standings, matches, clock, onSelect, onOpenMatch } = handle.props;
    if (selection.kind === 'competition') {
      const standing = findStanding(standings, selection.code);
      return standing ? (
        <CompetitionPage standing={standing} clubs={clubs} matches={matches} clock={clock} onSelect={onSelect} />
      ) : null;
    }
    const club = clubs.find((c) => c.id === selection.id);
    return club ? (
      <ClubPage
        club={club}
        standings={standings}
        entry={matches.get(club.id)}
        clock={clock}
        onSelect={onSelect}
        onRetry={() => matches.load(club.id)}
        onOpenMatch={onOpenMatch}
      />
    ) : null;
  };
}

// ───────── styles ─────────

const rootStyles = css({
  position: 'relative',
  flex: '1',
  minHeight: 0,
  overflow: 'hidden',
  background: v('--color-black'),

  '&[data-dragging]': {
    cursor: 'col-resize',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
});

const paneStyles = css({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: `${RAIL_PX}px`,
  right: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  background: v('--color-bg'),
  transformOrigin: '100% 50%',
  willChange: 'transform',
  scrollbarWidth: 'none',

  '&::-webkit-scrollbar': {
    display: 'none',
  },
});

const pageStyles = css({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space(4),
  maxWidth: '72rem',
  margin: '0 auto',
  padding: `calc(${v('--safe-area-inset-top')} + ${space(5)}) calc(${v('--safe-area-inset-right')} + ${space(6)}) calc(${v('--safe-area-inset-bottom')} + ${space(8)}) ${space(6)}`,
  transition: `opacity 220ms ${v('--ease-out')}, transform 220ms ${v('--ease-out')}`,

  '&[data-enter]': {
    opacity: 0,
    transform: `translateY(${space(2)})`,
    transition: 'none',
  },

  '&[data-leave]': {
    opacity: 0,
    transitionDuration: '120ms',
  },
});

const edgeStyles = css({
  position: 'absolute',
  left: `${RAIL_PX}px`,
  right: 0,
  zIndex: 2,
  height: space(10),
  opacity: 0,
  pointerEvents: 'none',
  transition: `opacity 200ms ${v('--ease-out')}`,

  '&[data-side="top"]': {
    top: 0,
    background: `linear-gradient(${v('--color-bg')} 15%, transparent)`,
  },

  '&[data-side="bottom"]': {
    bottom: 0,
    background: `linear-gradient(transparent, ${v('--color-bg')} 85%)`,
  },

  '&[data-on]': {
    opacity: 1,
  },
});

const scrimStyles = css({
  position: 'absolute',
  inset: 0,
  zIndex: 3,
  background: v('--color-black'),
  opacity: 0,
  pointerEvents: 'none',

  '&[data-on]': {
    pointerEvents: 'auto',
  },
});

// The grip rides the panel's edge; its 28px strip is the drag target.
const gripStyles = css({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '-14px',
  zIndex: 6,
  width: '28px',
  cursor: 'col-resize',
  touchAction: 'none',
  willChange: 'transform',
  transform: `translate3d(${RAIL_PX}px, 0, 0)`,

  '& i': {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '6px',
    height: space(11),
    marginTop: space(-5.5),
    marginLeft: '-3px',
    borderRadius: v('--radius-full'),
    background: v('--color-grabber'),
    opacity: 0.45,
    transition: `opacity 160ms ${v('--ease-out')}, transform 160ms ${v('--ease-out')}`,
  },

  '&:focus-visible': {
    outline: 'none',
  },

  '&:focus-visible i, [data-dragging] & i': {
    opacity: 1,
    transform: 'scaleY(1.15)',
  },

  '@media (hover: hover) and (pointer: fine)': {
    '&:hover i': {
      opacity: 1,
    },
  },
});
