import { css, on, ref, type Handle } from 'remix/component';

import type { MatchReport, Side } from '../../../lib/match-report.ts';
import type { Replay } from '../../../lib/match-replay.ts';
import { space, v } from '../../../ui/theme.ts';
import { ClubCrest } from '../clubs/club-crest.tsx';
import { SPRING, Value, blockScrollWhile, clamp, rubber, tracker, type Spring, type Tracker } from '../motion.ts';
import { countRender } from '../perf/renders.ts';
import {
  ROLE_NAME,
  formatRating,
  lineupOf,
  ratingTone,
  type Lineup,
  type LineupPlayer,
} from './lineup.ts';

// Lineups on the match sheet: one side at a time, the starting XI with faces on their half of the
// pitch and the bench below. A segmented switch and a horizontal swipe move between the sides;
// the switch's highlight rides the same value as the pages, so it tracks the finger 1:1. When the
// sheet is wide enough the two halves stand side by side and nothing pages.
//
// Every player is a button. Pressing one opens a card scaled from them with their rating, minutes
// and what they did; each event jumps the replay there. It is the seam a player page will use.

type Props = {
  report: MatchReport;
  replay: Replay | null;
  usSide: Side;
  onSeek: (t: number) => void;
};

type Peek = { player: LineupPlayer; side: Side; anchor: HTMLElement; leaving: boolean };

/** The pitch box's width over its height: one half, plus a strip of the other past halfway. */
const PITCH_ASPECT = 0.86;
const PEEK_WIDTH_REM = 18;
const PEEK_GAP = 8;
/** Room the docked strip takes at the top of the sheet, which a peek shouldn't open under. */
const DOCK_ROOM = 104;

export function Lineups(handle: Handle<Props>) {
  let built: MatchReport | null = null;
  let teams: [Lineup, Lineup] | null = null;
  let index = 0;
  let wide = false;
  let peek: Peek | null = null;
  let root: HTMLElement | undefined;
  let leaveTimer = 0;
  let pager: ReturnType<typeof wirePager> | null = null;

  function build() {
    const { report, replay, usSide } = handle.props;
    if (report === built) return;
    built = report;
    const us = lineupOf(report, replay, usSide);
    const them = lineupOf(report, replay, usSide === 'home' ? 'away' : 'home');
    teams = us && them ? [us, them] : null;
  }

  function select(i: number) {
    if (i === index) return;
    index = i;
    closePeek();
    handle.update();
  }

  function setWide(next: boolean) {
    if (next === wide) return;
    wide = next;
    handle.update();
  }

  function openPeek(player: LineupPlayer, side: Side, anchor: HTMLElement) {
    if (peek && !peek.leaving && peek.player.id === player.id) return closePeek();
    clearTimeout(leaveTimer);
    peek = { player, side, anchor, leaving: false };
    handle.update();
  }

  function closePeek() {
    if (!peek || peek.leaving) return;
    peek.leaving = true;
    handle.update();
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!peek?.leaving) return;
      peek = null;
      handle.update();
    }, 160);
  }

  // A press anywhere but a player or the card closes the card.
  document.addEventListener('pointerdown', (event) => {
    if (!peek || peek.leaving) return;
    const target = event.target as Element | null;
    if (target?.closest('[data-peek], [data-player]')) return;
    closePeek();
  }, { capture: true, signal: handle.signal });
  // Escape closes the card before it reaches the sheet, wherever focus is (Safari doesn't focus
  // a pressed button, so the press that opened the card may have left focus on the sheet).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !peek || peek.leaving) return;
    event.stopPropagation();
    event.preventDefault();
    closePeek();
  }, { capture: true, signal: handle.signal });
  handle.signal.addEventListener('abort', () => clearTimeout(leaveTimer));

  function placePeek(card: HTMLElement) {
    if (!root || !peek) return;
    const anchor = peek.anchor.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const scroller = scrollParent(root)?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = Math.min(PEEK_WIDTH_REM * rem, box.width);
    card.style.width = `${width}px`;
    const height = card.offsetHeight;
    const center = anchor.left + anchor.width / 2 - box.left;
    const fitsBelow = anchor.bottom + PEEK_GAP + height <= scroller.bottom - 16;
    const fitsAbove = anchor.top - PEEK_GAP - height >= scroller.top + DOCK_ROOM;
    const below = fitsBelow || !fitsAbove;
    const left = clamp(center - width / 2, 0, box.width - width);
    const top = below ? anchor.bottom - box.top + PEEK_GAP : anchor.top - box.top - PEEK_GAP - height;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transformOrigin = `${center - left}px ${below ? 0 : height}px`;
    requestAnimationFrame(() => card.setAttribute('data-in', ''));
  }

  build();

  return () => {
    countRender('Lineups');
    build();
    if (!teams) return null;
    const { onSeek } = handle.props;
    const pair = teams;
    const toneOf = (team: Lineup) => (team === pair[0] ? 'us' : 'them');
    const other = pair[1 - index]!;
    const tabId = (i: number) => `${handle.id}-tab-${i}`;
    const pageId = (i: number) => `${handle.id}-page-${i}`;

    const playerButton = (p: LineupPlayer, team: Lineup) =>
      on<HTMLButtonElement>('click', (event) => openPeek(p, team.side, event.currentTarget));

    return (
      <section
        mix={[sectionStyles, ref((node) => (root = node))]}
        aria-label='Lineups'
        data-lineups
        data-wide={wide ? '' : undefined}
      >
        <h3 mix={labelStyles}>
          Lineups <span data-hint>swipe for {other.club.tla || other.club.name}</span>
        </h3>

        <div
          mix={[segmentStyles, on('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = event.key === 'ArrowLeft' ? 0 : 1;
            pager?.go(next);
            (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
          })]}
          role='tablist'
          aria-label='Team'
        >
          <span data-highlight aria-hidden='true' />
          {pair.map((team, i) => (
            <button
              key={team.side}
              type='button'
              role='tab'
              id={tabId(i)}
              aria-controls={pageId(i)}
              aria-selected={i === index ? 'true' : 'false'}
              tabIndex={i === index ? 0 : -1}
              data-tone={toneOf(team)}
              mix={on('click', () => pager?.go(i))}
            >
              <ClubCrest crest={team.club.crest} size={space(5)} />
              <b>{team.club.tla || team.club.name}</b>
              {team.formation && <span>{team.formation}</span>}
            </button>
          ))}
        </div>

        <div
          mix={[viewStyles, ref((node, signal) => {
            pager = wirePager(node as HTMLElement, signal, {
              root: () => root,
              initial: index,
              onIndex: select,
              onWide: setWide,
              onGrab: closePeek,
            });
          })]}
          data-view
        >
          <div data-track mix={trackStyles}>
            {pair.map((team, i) => (
              <div
                key={team.side}
                id={pageId(i)}
                role='tabpanel'
                aria-labelledby={tabId(i)}
                inert={!wide && i !== index}
                mix={pageStyles}
                style={{ '--team': toneOf(team) === 'us' ? 'var(--us)' : 'var(--them)' }}
              >
                <div mix={teamHeadStyles}>
                  <ClubCrest crest={team.club.crest} size={space(7)} />
                  <div>
                    <b>{team.club.name}</b>
                    <small>{team.formation ? `${team.formation} · ` : ''}Starting XI</small>
                  </div>
                </div>

                <div mix={pitchStyles} style={{ aspectRatio: String(PITCH_ASPECT) }}>
                  <PitchLines />
                  {team.starters.filter((p) => p.at).map((p) => (
                    <button
                      key={p.id}
                      type='button'
                      mix={[markerStyles, playerButton(p, team)]}
                      data-player={p.id}
                      data-selected={peek?.player.id === p.id && !peek.leaving ? '' : undefined}
                      style={{ left: `clamp(var(--half), ${p.at!.x}%, calc(100% - var(--half)))`, top: `${p.at!.y}%` }}
                      aria-label={`${p.name}${p.rating != null ? `, rated ${formatRating(p.rating)}` : ''}`}
                    >
                      <span data-face>
                        <Photo player={p} />
                        <span data-shirt>{p.shirt ?? ''}</span>
                      </span>
                      {p.rating != null && (
                        <span mix={[ratingStyles, pitchRatingStyles]} data-on-pitch data-tone={ratingTone(p.rating)}>
                          {formatRating(p.rating)}
                        </span>
                      )}
                      <Glyphs player={p} />
                      <span data-name>
                        {p.captain && <i>C</i>}
                        {p.motm ? '★ ' : ''}
                        {p.short}
                      </span>
                    </button>
                  ))}
                </div>

                <div mix={benchStyles}>
                  <p data-bench-head>
                    <ClubCrest crest={team.club.crest} size={space(4.5)} />
                    <b>{team.club.tla || team.club.name} bench</b>
                    <span data-count>{team.used.length} used</span>
                  </p>
                  <ol mix={cardStyles}>
                    {team.used.length ? (
                      team.used.map((p) => (
                        <li key={p.id}>
                          <button
                            type='button'
                            mix={playerButton(p, team)}
                            data-player={p.id}
                            data-selected={peek?.player.id === p.id && !peek.leaving ? '' : undefined}
                          >
                            <span data-minute>{p.on}</span>
                            <span data-who>
                              <b>{p.short}</b>
                              {p.replaced && <small>for {p.replaced}</small>}
                            </span>
                            <Glyphs player={p} />
                            <span mix={ratingStyles} data-tone={ratingTone(p.rating)}>
                              {formatRating(p.rating)}
                            </span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li data-none>No changes</li>
                    )}
                  </ol>
                  {team.unused.length > 0 && (
                    <div data-chips>
                      {team.unused.map((p) => (
                        <button
                          key={p.id}
                          type='button'
                          mix={playerButton(p, team)}
                          data-player={p.id}
                          data-selected={peek?.player.id === p.id && !peek.leaving ? '' : undefined}
                        >
                          <span>{p.shirt ?? ''}</span>
                          {p.short}
                        </button>
                      ))}
                    </div>
                  )}
                  {team.coach && (
                    <p data-coach>
                      Coach <b>{team.coach}</b>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {peek && (
          <PeekCard
            key={peek.player.id}
            peek={peek}
            team={peek.side === pair[0].side ? pair[0] : pair[1]}
            tone={peek.side === pair[0].side ? 'us' : 'them'}
            onPlace={placePeek}
            onSeek={onSeek}
          />
        )}
      </section>
    );
  };
}

function PeekCard(
  handle: Handle<{
    peek: Peek;
    team: Lineup;
    tone: 'us' | 'them';
    onPlace: (card: HTMLElement) => void;
    onSeek: (t: number) => void;
  }>,
) {
  return () => {
    const { peek, team, tone, onPlace, onSeek } = handle.props;
    const p = peek.player;
    const details = [
      p.shirt ? `#${p.shirt}` : null,
      p.role ? ROLE_NAME[p.role] : 'Substitute',
      p.captain ? 'Captain' : null,
    ].filter(Boolean).join(' · ');
    return (
      <div
        mix={[peekStyles, ref((node) => onPlace(node as HTMLElement))]}
        role='dialog'
        aria-label={p.name}
        data-peek
        data-leaving={peek.leaving ? '' : undefined}
        style={{ '--team': tone === 'us' ? 'var(--us)' : 'var(--them)' }}
      >
        <div data-top>
          <span data-photo>
            <b>{p.shirt ?? ''}</b>
            <Photo player={p} />
          </span>
          <div data-name>
            <b>{p.name}</b>
            <small>{details}</small>
            <small data-club>
              <ClubCrest crest={team.club.crest} size={space(4)} />
              {team.club.name}
            </small>
          </div>
          <span mix={[ratingStyles, bigRatingStyles]} data-tone={ratingTone(p.rating)}>
            {formatRating(p.rating)}
          </span>
        </div>
        {p.motm && <p data-motm>★ Player of the match</p>}
        <p data-minutes>
          {p.minutes}
          {p.assists ? ` · ${p.assists} assist${p.assists > 1 ? 's' : ''}` : ''}
        </p>
        {p.events.length > 0 && (
          <ol data-events>
            {p.events.map((event, i) => (
              <li key={i}>
                {event.t !== null ? (
                  <button type='button' data-kind={event.kind} mix={on('click', () => onSeek(event.t!))}>
                    <span>{event.label}</span>
                    <i aria-hidden='true' />
                    {event.text}
                  </button>
                ) : (
                  <p data-kind={event.kind}>
                    <span>{event.label}</span>
                    <i aria-hidden='true' />
                    {event.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };
}

/** A FotMob headshot. Players without one keep the shirt number painted behind. */
function Photo(handle: Handle<{ player: LineupPlayer }>) {
  return () => (
    <img
      src={handle.props.player.photo}
      alt=''
      loading='lazy'
      draggable={false}
      mix={on<HTMLImageElement>('error', (event) => {
        event.currentTarget.style.display = 'none';
      })}
    />
  );
}

function Glyphs(handle: Handle<{ player: LineupPlayer }>) {
  return () => {
    const p = handle.props.player;
    const subbedOff = p.off !== null && !p.sentOff;
    if (!p.goals && !p.card && !subbedOff) return null;
    return (
      <span mix={glyphStyles} data-glyphs aria-hidden='true'>
        {p.goals > 0 && <i data-glyph='goal' />}
        {p.goals > 1 && <b data-goals>{p.goals}</b>}
        {p.card && <i data-glyph='card' data-card={p.card} />}
        {subbedOff && <i data-glyph='off' />}
      </span>
    );
  };
}

// Pitch markings in metres: our own half, goal at the bottom, and a little of the other half
// above the halfway line. Stretched to the box, which keeps the pitch's proportions.
function PitchLines() {
  return () => {
    const W = 68;
    const L = W / PITCH_ASPECT;
    const mid = L * 0.14;
    const goal = L - 1;
    const c = W / 2;
    const arc = Math.sqrt(9.15 ** 2 - 5.5 ** 2);
    const box = goal - 16.5;
    return (
      <svg viewBox={`0 0 ${W} ${L}`} preserveAspectRatio='none' aria-hidden='true' data-lines>
        <path d={`M1 0 V${goal} H${W - 1} V0`} />
        <line x1={1} x2={W - 1} y1={mid} y2={mid} />
        <path d={`M${c - 9.15} ${mid} A9.15 9.15 0 0 0 ${c + 9.15} ${mid}`} />
        <circle cx={c} cy={mid} r={0.5} data-fill />
        <rect x={c - 20.15} y={box} width={40.3} height={16.5} />
        <rect x={c - 9.15} y={goal - 5.5} width={18.3} height={5.5} />
        <circle cx={c} cy={goal - 11} r={0.45} data-fill />
        <path d={`M${c - arc} ${box} A9.15 9.15 0 0 1 ${c + arc} ${box}`} />
      </svg>
    );
  };
}

// ───────── pager ─────────
// Tracks 1:1 with an axis lock (a vertical drag scrolls the sheet), rubber-bands past either end
// and lands with the fling. The segment highlight follows the same value.

function wirePager(
  view: HTMLElement,
  signal: AbortSignal,
  options: {
    root: () => HTMLElement | undefined;
    initial: number;
    onIndex: (i: number) => void;
    onWide: (wide: boolean) => void;
    onGrab: () => void;
  },
) {
  const track = view.querySelector<HTMLElement>('[data-track]')!;
  const section = options.root() ?? view.parentElement!;
  const highlight = section.querySelector<HTMLElement>('[data-highlight]')!;
  const count = track.children.length;
  let index = options.initial;
  let wide = false;
  let suppressClick = false;
  const width = () => view.clientWidth || 1;

  const x = new Value(-index * width(), (value) => {
    track.style.transform = wide ? '' : `translate3d(${value}px, 0, 0)`;
    highlight.style.transform = `translateX(${(-value / width()) * 100}%)`;
  });

  function go(i: number, { spring = SPRING.settle, velocity }: { spring?: Spring; velocity?: number } = {}) {
    index = clamp(i, 0, count - 1);
    options.onIndex(index);
    if (wide) return x.set(-index * width());
    void x.to(-index * width(), { spring, velocity });
  }

  // The halves stand side by side once the sheet's container query lays the track out as a grid.
  const resize = new ResizeObserver(() => {
    wide = getComputedStyle(track).display === 'grid';
    options.onWide(wide);
    x.set(-index * width());
  });
  resize.observe(view);
  signal.addEventListener('abort', () => resize.disconnect());

  let gesture: { id: number; x0: number; y0: number; start: number; claimed: boolean; velocity: Tracker } | null = null;

  view.addEventListener('pointerdown', (e) => {
    if (wide || e.button > 0 || !e.isPrimary) return;
    const caught = x.animating;
    x.stop();
    const velocity = tracker();
    velocity.reset(e.clientX, e.clientY, e.timeStamp);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: x.value, claimed: caught, velocity };
    if (caught) view.setPointerCapture(e.pointerId);
  }, { signal });

  view.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture.velocity.add(e.clientX, e.clientY, e.timeStamp);
    let dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (!gesture.claimed) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      gesture.claimed = true;
      gesture.x0 = e.clientX;
      dx = 0;
      view.setPointerCapture(e.pointerId);
      view.setAttribute('data-dragging', '');
      options.onGrab();
    }
    const w = width();
    const min = -(count - 1) * w;
    const raw = gesture.start + dx;
    x.set(raw > 0 ? rubber(raw, w) : raw < min ? min + rubber(raw - min, w) : raw);
  }, { signal });

  const onUp = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const { claimed } = gesture;
    const velocity = e.type === 'pointerup' ? gesture.velocity.velocity(e.timeStamp).x : 0;
    gesture = null;
    view.removeAttribute('data-dragging');
    if (!claimed) {
      // Caught mid-flight and let go without moving: finish where it was heading.
      if (x.value !== -index * width()) go(index, { spring: SPRING.snap });
      return;
    }
    // The click that ends a swipe shouldn't open the player under the finger.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const w = width();
    const from = Math.round(-x.value / w);
    const target = clamp(Math.round(-(x.value + velocity * 0.2) / w), Math.max(0, from - 1), Math.min(count - 1, from + 1));
    go(target, { velocity, spring: SPRING.release });
  };
  view.addEventListener('pointerup', onUp, { signal });
  view.addEventListener('pointercancel', onUp, { signal });

  view.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true, signal });

  blockScrollWhile(view, () => !!gesture?.claimed, signal);
  signal.addEventListener('abort', () => x.stop());

  return { go };
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

// ───────── styles ─────────

const ease = v('--ease-out');

const sectionStyles = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: space(3),
  minWidth: 0,
  paddingTop: space(6),
  '@keyframes lineups-reveal': {
    from: { opacity: 0, transform: `translateY(${space(2)})` },
    to: { opacity: 1, transform: 'none' },
  },
  animation: `lineups-reveal 320ms ${ease} 200ms backwards`,

  '& > h3': { padding: `0 ${space(1)}` },
});

const labelStyles = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: space(2),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),

  '& span': {
    textTransform: 'none',
    fontSize: v('--text-2xs'),
    color: v('--color-text-tertiary'),
  },
  // Side by side there's nothing to swipe to.
  '@container (min-width: 36rem)': { '& [data-hint]': { display: 'none' } },
});

const segmentStyles = css({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  padding: '3px',
  borderRadius: v('--radius-full'),
  background: v('--color-well'),

  '& [data-highlight]': {
    position: 'absolute',
    top: '3px',
    bottom: '3px',
    left: '3px',
    width: 'calc(50% - 3px)',
    borderRadius: v('--radius-full'),
    background: v('--color-surface-raised'),
    boxShadow: `${v('--shadow-highlight')}, 0 2px 8px oklch(0% 0 0 / 0.3)`,
    willChange: 'transform',
  },
  '& button': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    height: space(10),
    borderRadius: v('--radius-full'),
    fontSize: v('--text-xs'),
    color: v('--color-text-secondary'),
    transition: `color 160ms ${ease}`,
  },
  '& button[aria-selected="true"]': { color: v('--color-text') },
  '& button span': { fontSize: v('--text-3xs'), color: v('--color-text-tertiary') },
  '& button:focus-visible': { outline: `2px solid ${v('--color-accent')}`, outlineOffset: '-2px' },

  '@container (min-width: 36rem)': { display: 'none' },
});

const viewStyles = css({
  overflow: 'hidden',
  margin: `0 calc(${v('--gutter')} * -1)`,
  padding: `0 ${v('--gutter')}`,
  touchAction: 'pan-y',

  '@container (min-width: 36rem)': { overflow: 'visible' },
});

const trackStyles = css({
  display: 'flex',
  gap: `calc(${v('--gutter')} * 2)`,
  willChange: 'transform',

  '@container (min-width: 36rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: space(5),
    transform: 'none !important',
    willChange: 'auto',
  },
});

const pageStyles = css({
  flex: '0 0 100%',
  display: 'flex',
  flexDirection: 'column',
  gap: space(4),
  minWidth: 0,
});

const teamHeadStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2.5),
  padding: `0 ${space(1)}`,

  '& div': { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  '& b': { fontSize: v('--text-sm'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& small': { fontSize: v('--text-2xs'), color: v('--color-text-tertiary') },
});

const pitchStyles = css({
  position: 'relative',
  width: '100%',
  borderRadius: v('--radius-lg'),
  background: `repeating-linear-gradient(180deg, ${v('--color-pitch')} 0 10%, ${v('--color-pitch-stripe')} 10% 20%)`,
  boxShadow: `${v('--shadow-highlight')}, inset 0 0 0 1px oklch(100% 0 0 / 0.04)`,

  '& [data-lines]': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    fill: 'none',
    stroke: v('--color-pitch-line'),
    strokeWidth: 1,
    pointerEvents: 'none',
  },
  '& [data-lines] *': { vectorEffect: 'non-scaling-stroke' },
  '& [data-lines] [data-fill]': { fill: v('--color-pitch-line') },
});

const markerStyles = css({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(1),
  // A flank player's name stays on the pitch: their centre keeps half a marker from the touchline.
  '--half': '2.375rem',
  width: 'calc(var(--half) * 2)',
  transform: 'translate(-50%, -1.375rem)',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  outline: 'none',

  '& [data-face]': {
    position: 'relative',
    display: 'grid',
    placeItems: 'end center',
    width: space(11),
    height: space(11),
    borderRadius: v('--radius-full'),
    background: `color-mix(in oklab, var(--team) 30%, ${v('--color-surface')})`,
    boxShadow: `0 0 0 2px var(--team), 0 0.375rem 0.875rem oklch(0% 0 0 / 0.45)`,
    transition: `transform ${v('--duration-press')} ${ease}, box-shadow 160ms ${ease}`,
  },
  '& [data-face] img': {
    width: '100%',
    height: '100%',
    borderRadius: v('--radius-full'),
    objectFit: 'cover',
    objectPosition: '50% 15%',
    pointerEvents: 'none',
  },
  '& [data-shirt]': {
    position: 'absolute',
    left: '-0.3125rem',
    bottom: space(-1),
    display: 'grid',
    placeItems: 'center',
    minWidth: '1.0625rem',
    height: '1.0625rem',
    padding: '0 2px',
    borderRadius: v('--radius-full'),
    background: 'var(--team)',
    color: v('--color-bg'),
    fontSize: v('--text-4xs'),
    fontWeight: v('--font-weight-black'),
    boxShadow: `0 0 0 1.5px ${v('--color-pitch')}`,
  },
  '& > [data-glyphs]': { position: 'absolute', top: space(7), left: 'calc(50% + 0.875rem)' },
  '& [data-name]': {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: v('--text-3xs'),
    fontWeight: v('--font-weight-bold'),
    letterSpacing: v('--tracking-tight'),
    textShadow: '0 1px 4px oklch(0% 0 0 / 0.8)',
  },
  '& [data-name] i': {
    fontStyle: 'normal',
    marginRight: space(1),
    padding: '0 0.1875rem',
    borderRadius: '3px',
    background: v('--color-text'),
    color: v('--color-bg'),
    fontSize: '0.5rem',
  },
  '&:active [data-face]': { transform: 'scale(0.93)' },
  '&:focus-visible [data-face]': { boxShadow: `0 0 0 2px var(--team), 0 0 0 4px ${v('--color-accent')}` },
  '&[data-selected] [data-face]': {
    boxShadow: `0 0 0 2px var(--team), 0 0 0 4px ${v('--color-surface')}, 0 0 0 6px ${v('--color-text')}`,
  },
  '[data-dragging] &': { pointerEvents: 'none' },

  // Two halves side by side on a mid-width sheet: smaller faces so a back four still fits.
  '@container (min-width: 36rem) and (max-width: 50rem)': {
    '--half': '2rem',
    transform: 'translate(-50%, -1.125rem)',
    '& [data-face]': { width: space(9), height: space(9) },
    '& > [data-glyphs]': { top: '1.375rem', left: 'calc(50% + 0.75rem)' },
  },
});

const ratingStyles = css({
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: space(7),
  padding: `2px ${space(1)}`,
  borderRadius: '0.3125rem',
  fontSize: v('--text-3xs'),
  fontWeight: v('--font-weight-extrabold'),
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.2,
  color: v('--color-bg'),
  background: v('--color-well'),

  '&[data-tone="top"]': { background: v('--color-rating-top') },
  '&[data-tone="good"]': { background: v('--color-win') },
  '&[data-tone="ok"]': { background: v('--color-warning') },
  '&[data-tone="poor"]': { background: v('--color-loss') },
  '&[data-tone="none"]': {
    color: v('--color-text-tertiary'),
    background: 'none',
    boxShadow: `inset 0 0 0 1px ${v('--color-separator')}`,
  },
});

// On the pitch the rating is a small tag on the face's shoulder. (Its own class, so it lands
// after ratingStyles: later classes win, whatever the specificity.)
const pitchRatingStyles = css({
  position: 'absolute',
  top: '-0.3125rem',
  left: 'calc(50% + 0.75rem)',
  minWidth: 0,
  padding: '1px 0.1875rem',
  fontSize: v('--text-4xs'),
  boxShadow: `0 0 0 1.5px ${v('--color-pitch')}`,

  '@container (min-width: 36rem) and (max-width: 50rem)': { left: 'calc(50% + 0.5rem)' },
});

const bigRatingStyles = css({
  minWidth: space(10),
  padding: `${space(1)} ${space(1.5)}`,
  borderRadius: '0.5rem',
  fontSize: v('--text-sm'),
});

const glyphStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',

  '& [data-glyph="goal"]': {
    position: 'relative',
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: v('--radius-full'),
    background: v('--color-text'),
    boxShadow: `0 0 0 1.5px ${v('--color-bg')}`,
  },
  '& [data-glyph="goal"]::after': {
    content: '""',
    position: 'absolute',
    inset: '2.5px',
    borderRadius: v('--radius-full'),
    background: v('--color-bg'),
    opacity: 0.85,
    clipPath: 'polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)',
  },
  '& [data-goals]': {
    marginLeft: '-1px',
    marginRight: '1px',
    fontSize: '0.5rem',
    fontWeight: v('--font-weight-black'),
    color: v('--color-text'),
    textShadow: '0 1px 3px oklch(0% 0 0 / 0.8)',
  },
  '& [data-glyph="card"]': {
    width: '0.4375rem',
    height: '0.625rem',
    borderRadius: '1.5px',
    background: v('--color-warning'),
    boxShadow: `0 0 0 1.5px ${v('--color-bg')}`,
  },
  '& [data-card="red"], & [data-card="second-yellow"]': { background: v('--color-loss') },
  '& [data-glyph="off"]': {
    position: 'relative',
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: v('--radius-full'),
    background: v('--color-bg'),
  },
  '& [data-glyph="off"]::before': {
    content: '""',
    position: 'absolute',
    inset: '2px 2.5px 1.5px',
    background: v('--color-loss'),
    clipPath: 'polygon(30% 0, 70% 0, 70% 45%, 100% 45%, 50% 100%, 0 45%, 30% 45%)',
  },
});

const cardStyles = css({
  listStyle: 'none',
  padding: `${space(1)} 0`,
  borderRadius: v('--radius-lg'),
  background: v('--card-fill'),
  boxShadow: v('--shadow-highlight'),
  overflow: 'hidden',
});

const benchStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  minWidth: 0,

  '& [data-bench-head]': {
    display: 'flex',
    alignItems: 'center',
    gap: space(2),
    padding: `0 ${space(1)}`,
    fontSize: v('--text-xs'),
  },
  '& [data-bench-head] [data-count]': { marginLeft: 'auto', fontSize: v('--text-2xs'), color: v('--color-text-tertiary') },
  '& li + li': { boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}` },
  '& ol button': {
    display: 'grid',
    gridTemplateColumns: `${space(14)} minmax(0, 1fr) auto auto`,
    alignItems: 'center',
    gap: space(2),
    width: '100%',
    minHeight: space(11.5),
    padding: `${space(1.5)} ${space(3.5)}`,
    textAlign: 'left',
    transition: `background-color 160ms ${ease}`,
  },
  '& ol button:active, & ol button[data-selected]': { background: v('--color-press') },
  '& ol button:focus-visible': { outline: `2px solid ${v('--color-accent')}`, outlineOffset: '-2px' },
  '& [data-minute]': {
    whiteSpace: 'nowrap',
    fontSize: v('--text-2xs'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
    color: v('--color-win'),
  },
  '& [data-minute]::before': { content: '"↑ "' },
  '& [data-who]': { display: 'flex', flexDirection: 'column', minWidth: 0 },
  '& [data-who] b, & [data-who] small': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& [data-who] b': { fontSize: v('--text-xs') },
  '& [data-who] small': { fontSize: v('--text-3xs'), color: v('--color-text-tertiary') },
  '& [data-none]': { padding: `${space(3)} ${space(3.5)}`, fontSize: v('--text-2xs'), color: v('--color-text-tertiary') },
  '& [data-chips]': { display: 'flex', flexWrap: 'wrap', gap: space(1.5) },
  '& [data-chips] button': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space(1.5),
    minHeight: space(8),
    padding: `0 ${space(2.5)}`,
    borderRadius: v('--radius-full'),
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    background: v('--color-well'),
    transition: `transform ${v('--duration-press')} ${ease}, background-color 160ms ${ease}`,
  },
  '& [data-chips] button span': { color: v('--color-text-tertiary'), fontVariantNumeric: 'tabular-nums' },
  '& [data-chips] button:active': { transform: 'scale(0.96)' },
  '& [data-chips] button[data-selected]': {
    background: `color-mix(in oklab, ${v('--color-text')} 14%, transparent)`,
    color: v('--color-text'),
  },
  '& [data-chips] button:focus-visible': { outline: `2px solid ${v('--color-accent')}` },
  '& [data-coach]': { padding: `0 ${space(1)}`, fontSize: v('--text-2xs'), color: v('--color-text-tertiary') },
  '& [data-coach] b': { fontWeight: v('--font-weight-semibold'), color: v('--color-text-secondary') },
});

// The player card grows out of the player it belongs to, and settles back quicker than it came.
const peekStyles = css({
  position: 'absolute',
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  padding: space(3.5),
  borderRadius: v('--radius-lg'),
  background: v('--color-float'),
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  boxShadow: `${v('--shadow-highlight')}, 0 0 0 0.5px oklch(100% 0 0 / 0.08), 0 1.25rem 2.5rem oklch(0% 0 0 / 0.5)`,
  opacity: 0,
  transform: 'scale(0.92)',
  transition: `opacity 180ms ${ease}, transform 220ms ${ease}`,

  '&[data-in]': { opacity: 1, transform: 'none' },
  '&[data-leaving]': { opacity: 0, transform: 'scale(0.97)', transitionDuration: '140ms', pointerEvents: 'none' },

  '& [data-top]': {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: space(3),
  },
  '& [data-photo]': {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    width: space(12),
    height: space(12),
    borderRadius: v('--radius-full'),
    overflow: 'hidden',
    background: `color-mix(in oklab, var(--team) 28%, ${v('--color-surface')})`,
    boxShadow: '0 0 0 2px var(--team)',
  },
  '& [data-photo] img': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: '50% 15%',
  },
  '& [data-photo] b': { fontSize: v('--text-sm'), color: 'var(--team)' },
  '& [data-name]': { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  '& [data-name] b': { fontSize: v('--text-sm') },
  '& [data-name] small': { fontSize: v('--text-3xs'), color: v('--color-text-secondary') },
  '& [data-name] [data-club]': { display: 'flex', alignItems: 'center', gap: '0.3125rem', color: v('--color-text-tertiary') },
  '& [data-motm]': { fontSize: v('--text-2xs'), fontWeight: v('--font-weight-bold'), color: v('--color-rating-top') },
  '& [data-minutes]': { fontSize: v('--text-2xs'), color: v('--color-text-secondary') },
  '& [data-events]': { display: 'flex', flexDirection: 'column', listStyle: 'none', margin: `0 ${space(-2)} ${space(-1.5)}` },
  '& [data-events] button, & [data-events] p': {
    display: 'flex',
    alignItems: 'center',
    gap: space(2),
    width: '100%',
    minHeight: space(9),
    padding: `0 ${space(2)}`,
    borderRadius: '0.625rem',
    fontSize: v('--text-2xs'),
    textAlign: 'left',
    transition: `background-color 160ms ${ease}`,
  },
  '& [data-events] button:active': { background: 'oklch(100% 0 0 / 0.06)' },
  '& [data-events] button:focus-visible': { outline: `2px solid ${v('--color-accent')}`, outlineOffset: '-2px' },
  '& [data-events] span': {
    width: space(11),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
    color: v('--color-text-secondary'),
  },
  '& [data-events] i': { width: space(2), height: space(2), borderRadius: v('--radius-full'), background: v('--color-text') },
  '& [data-kind="yellow"] i': { width: space(1.5), height: '0.5625rem', borderRadius: '1px', background: v('--color-warning') },
  '& [data-kind="red"] i, & [data-kind="second-yellow"] i': {
    width: space(1.5),
    height: '0.5625rem',
    borderRadius: '1px',
    background: v('--color-loss'),
  },
  '& [data-kind="on"] i': { background: v('--color-win') },
  '& [data-kind="off"] i': { background: v('--color-loss') },
});
