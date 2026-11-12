import { css, on, ref, type Handle } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import { soon } from '../../../lib/match-format.ts';
import { hideScrollbar, space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { ClubCard, PendingClubCard } from './club-card.tsx';
import { ClubCrest } from './club-crest.tsx';
import type { MatchesModel } from './matches.ts';

// One club open as a full card; every other club is a one-line row. Tap a row to open it.
// When the list is taller than the space, content dissolves into the background at whichever
// edge has more, with a tappable count.

const ROW_PX = 44;
const HEIGHT_MS = 380;
const EDGE_SLOP_PX = 4;
const FOCUS_PAD_PX = 12;

type Props = { clubs: Club[]; clock: Clock; matches: MatchesModel };

export function ClubList(handle: Handle<Props>) {
  let openId: number | null = null;
  let scroller: HTMLElement | undefined;
  let edgeTop: HTMLElement | undefined;
  let edgeBottom: HTMLElement | undefined;
  let mounted = false;
  let scrollAfterLayout = false;

  const items = () => [...(scroller?.querySelectorAll<HTMLElement>('[data-fc]') ?? [])];
  const fullOf = (item: HTMLElement) => item.querySelector<HTMLElement>('[data-fc-full]')!;

  // ── edges, recomputed from scroll position (rAF-throttled)
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), updateEdges()));
  };
  // Keep the edges live while heights animate after a focus change.
  const follow = (ms: number) => {
    const until = performance.now() + ms;
    const tick = () => {
      updateEdges();
      if (performance.now() < until && !handle.signal.aborted) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  handle.signal.addEventListener('abort', () => cancelAnimationFrame(frame));

  function updateEdges() {
    if (!scroller || !edgeTop || !edgeBottom) return;
    const top = scroller.scrollTop;
    const height = scroller.clientHeight;
    const max = scroller.scrollHeight - height;

    let above = 0;
    let below = 0;
    for (const item of items()) {
      const y = item.offsetTop - top;
      if (y < -EDGE_SLOP_PX) above++;
      if (y + item.offsetHeight > height + EDGE_SLOP_PX) below++;
    }
    for (const [edge, count, shown] of [
      [edgeTop, above, top > 2],
      [edgeBottom, below, top < max - 2],
    ] as const) {
      edge.toggleAttribute('data-on', shown);
      edge.querySelector('b')!.textContent = String(count);
      edge.querySelector<HTMLElement>('button')!.tabIndex = shown ? 0 : -1;
    }
  }

  // ── focus: the open card grows to its measured height, everyone else is a row
  function layout() {
    if (!scroller) return;
    const all = items();
    for (const item of all) {
      const isOpen = item.hasAttribute('data-open');
      item.style.height = `${isOpen ? fullOf(item).offsetHeight : ROW_PX}px`;
    }
    follow(HEIGHT_MS + 40);
    if (!scrollAfterLayout) return;
    scrollAfterLayout = false;
    // Bring the opened card fully into view once it has grown, clear of the edge treatment.
    setTimeout(() => {
      const item = all.find((el) => el.hasAttribute('data-open'));
      if (!item || !scroller) return;
      const y = item.offsetTop - scroller.scrollTop;
      if (y < FOCUS_PAD_PX) scroller.scrollBy({ top: y - FOCUS_PAD_PX, behavior: 'smooth' });
      else if (y + item.offsetHeight > scroller.clientHeight - FOCUS_PAD_PX)
        scroller.scrollBy({
          top: y + item.offsetHeight - scroller.clientHeight + FOCUS_PAD_PX,
          behavior: 'smooth',
        });
    }, HEIGHT_MS * 0.5);
  }

  // A card's height changes when its matches arrive; follow it if it's the open one.
  const resizes =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const item = (entry.target as HTMLElement).closest<HTMLElement>('[data-fc]');
            if (item?.hasAttribute('data-open')) {
              item.style.height = `${(entry.target as HTMLElement).offsetHeight}px`;
              follow(HEIGHT_MS + 40);
            }
          }
        });
  handle.signal.addEventListener('abort', () => resizes?.disconnect());

  function open(id: number) {
    if (id === openId) return;
    openId = id;
    scrollAfterLayout = true;
    handle.update();
  }

  function page(direction: -1 | 1) {
    scroller?.scrollBy({ top: direction * (scroller.clientHeight - ROW_PX * 2), behavior: 'smooth' });
  }

  return () => {
    countRender('ClubList');
    const { clubs, matches, clock } = handle.props;
    if (!clubs.some((club) => club.id === openId)) openId = clubs[0]?.id ?? null;

    handle.queueTask(() => {
      if (!mounted) {
        // First paint lands without animating heights.
        mounted = true;
        scroller?.setAttribute('data-no-anim', '');
        layout();
        requestAnimationFrame(() => requestAnimationFrame(() => scroller?.removeAttribute('data-no-anim')));
        return;
      }
      layout();
    });

    return (
      <div mix={regionStyles}>
        <div
          mix={[
            scrollerStyles,
            ref((node, signal) => {
              scroller = node;
              node.addEventListener('scroll', schedule, { passive: true, signal });
              window.addEventListener('resize', schedule, { signal });
            }),
          ]}
        >
          {clubs.map((club) => (
            <ClubItem
              key={club.id}
              club={club}
              matches={matches}
              clock={clock}
              open={club.id === openId}
              observe={(node, signal) => {
                resizes?.observe(node);
                signal.addEventListener('abort', () => resizes?.unobserve(node));
              }}
              onOpen={() => open(club.id)}
            />
          ))}
        </div>
        <Edge side='top' onPage={() => page(-1)} setRef={(node) => (edgeTop = node)} />
        <Edge side='bottom' onPage={() => page(1)} setRef={(node) => (edgeBottom = node)} />
      </div>
    );
  };
}

type ItemProps = {
  club: Club;
  clock: Clock;
  matches: MatchesModel;
  open: boolean;
  observe: (node: HTMLElement, signal: AbortSignal) => void;
  onOpen: () => void;
};

function ClubItem(handle: Handle<ItemProps>) {
  handle.props.matches.addEventListener(
    'change',
    (event) => {
      if (event.clubId === handle.props.club.id) handle.update();
    },
    { signal: handle.signal },
  );

  return () => {
    countRender('ClubItem');
    const { club, matches, clock, open, observe, onOpen } = handle.props;
    const entry = matches.get(club.id);
    const clubMatches = entry && entry.status !== 'error' ? entry.matches : undefined;
    const next = clubMatches?.fixtures[0];

    return (
      <div data-fc data-id={club.id} data-open={open ? '' : undefined} mix={itemStyles}>
        <button
          type='button'
          aria-expanded={open ? 'true' : 'false'}
          inert={open}
          mix={[rowStyles, on('click', onOpen)]}
        >
          <ClubCrest crest={club.crest} size={space(7)} />
          <span mix={rowNameStyles}>{club.name}</span>
          <span mix={rowDotsStyles} aria-label='Last five'>
            {clubMatches
              ? clubMatches.form.map((match, i) => <i key={i} data-r={match.result} />)
              : [0, 1, 2, 3, 4].map((i) => <i key={i} data-r='' />)}
          </span>
          <span mix={rowWhenStyles}>
            {next && (
              <>
                <b>{soon(new Date(next.utcDate), clock)}</b>
                {next.venue === 'H' ? 'vs' : 'at'}{' '}
                {next.opponent.tla || next.opponent.name.slice(0, 3).toUpperCase()}
              </>
            )}
          </span>
        </button>
        <div data-fc-full inert={!open} mix={[fullStyles, ref(observe)]}>
          {clubMatches ? (
            <ClubCard key={clubMatches.fetchedAt} club={club} matches={clubMatches} clock={clock} />
          ) : (
            <PendingClubCard
              club={club}
              failed={entry?.status === 'error'}
              onRetry={() => matches.load(club.id)}
            />
          )}
        </div>
      </div>
    );
  };
}

type EdgeProps = {
  side: 'top' | 'bottom';
  onPage: () => void;
  setRef: (node: HTMLElement) => void;
};

function Edge(handle: Handle<EdgeProps>) {
  return () => {
    const { side, onPage, setRef } = handle.props;

    return (
      <span
        data-side={side}
        mix={[edgeStyles, ref((node) => setRef(node))]}
      >
        <button type='button' tabIndex={-1} mix={[moreStyles, on('click', onPage)]}>
          {side === 'top' ? '↑' : '↓'} <b>0</b> more
        </button>
      </span>
    );
  };
}

// ───────── styles ─────────

const regionStyles = css({
  position: 'relative',
  flex: '1',
  minHeight: 0,
  margin: `0 ${space(2.5)}`,
});

const scrollerStyles = [
  hideScrollbar,
  css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space(1.5),
    paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(2)})`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // Never rest with a row half under an edge.
    scrollSnapType: 'y proximity',
    scrollPadding: `${space(2)} 0`,
  }),
];

// Height is set from JS (row ↔ full card). Same iOS curve as the app's sheet.
const itemStyles = css({
  position: 'relative',
  flex: 'none',
  height: space(11),
  overflow: 'hidden',
  borderRadius: v('--radius-lg'),
  background: v('--card-fill'),
  boxShadow: v('--shadow-highlight'),
  scrollSnapAlign: 'start',
  transition: `height ${v('--duration-focus')} ${v('--ease-ios')}`,

  // Before the first measurement (server render) the open card sizes itself.
  '&[data-open]': {
    height: 'auto',
  },

  '[data-no-anim] &, [data-no-anim] & *': {
    transition: 'none !important',
  },
});

const rowStyles = css({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  gap: space(2.5),
  height: space(11),
  padding: `0 ${space(3)} 0 ${space(2)}`,
  textAlign: 'left',
  transition: `opacity 160ms ${v('--ease-out')}`,

  '&:active': {
    background: v('--color-press'),
  },

  '&:focus-visible': {
    outline: `2px solid ${v('--color-accent')}`,
    outlineOffset: '-2px',
    borderRadius: v('--radius-lg'),
  },

  '[data-open] > &': {
    opacity: 0,
  },
});

const rowNameStyles = css({
  flex: '1',
  minWidth: 0,
  overflow: 'hidden',
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-bold'),
  letterSpacing: v('--tracking-tight'),
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

const rowDotsStyles = css({
  display: 'flex',
  gap: space(0.75),

  '& i': {
    width: space(2),
    height: space(2),
    borderRadius: space(0.5),
    background: v('--color-draw'),
  },

  '& i[data-r="W"]': { background: v('--color-win') },
  '& i[data-r="L"]': { background: v('--color-loss') },
  '& i[data-r=""]': { background: v('--color-separator') },
});

const rowWhenStyles = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'flex-end',
  gap: space(1.25),
  minWidth: space(19),
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),
  whiteSpace: 'nowrap',

  '& b': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    color: v('--color-text'),
  },
});

const fullStyles = css({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  opacity: 0,
  transition: `opacity 140ms ${v('--ease-out')}`,

  '[data-open] > &': {
    position: 'relative',
    opacity: 1,
    transition: `opacity 240ms ${v('--ease-out')} 90ms`,
  },
});

const edgeStyles = css({
  position: 'absolute',
  left: space(-2.5),
  right: space(-2.5),
  zIndex: 3,
  display: 'flex',
  justifyContent: 'center',
  height: space(14),
  opacity: 0,
  pointerEvents: 'none',
  transition: `opacity 200ms ${v('--ease-out')}`,

  '&[data-side="top"]': {
    top: 0,
    alignItems: 'flex-start',
    background: `linear-gradient(${v('--color-bg')} 10%, color-mix(in oklab, ${v('--color-bg')} 70%, transparent) 45%, transparent)`,
  },

  '&[data-side="bottom"]': {
    bottom: 0,
    alignItems: 'flex-end',
    paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(1.5)})`,
    height: `calc(${v('--safe-area-inset-bottom')} + ${space(16)})`,
    background: `linear-gradient(transparent, color-mix(in oklab, ${v('--color-bg')} 70%, transparent) 50%, ${v('--color-bg')} 88%)`,
  },

  '&[data-on]': {
    opacity: 1,
  },
});

const moreStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.25),
  height: space(6.5),
  padding: `0 ${space(3)}`,
  borderRadius: v('--radius-full'),
  background: v('--color-float'),
  boxShadow: `${v('--shadow-card')}, inset 0 0 0 1px ${v('--color-separator')}`,
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),
  visibility: 'hidden',
  transition: `transform 120ms ${v('--ease-out')}`,

  '& b': {
    color: v('--color-text'),
  },

  // 44px hit area around the 26px pill.
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: `${space(-2)} ${space(-1)}`,
  },

  '[data-on] > &': {
    position: 'relative',
    visibility: 'visible',
    pointerEvents: 'auto',
  },

  '&:active': {
    transform: 'scale(0.96)',
  },

  '[data-side="top"] > &': {
    marginTop: space(1),
  },
});
