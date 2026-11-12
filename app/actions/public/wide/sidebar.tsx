import { css, on, ref, type Handle } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { ordinal, soon, today } from '../../../lib/match-format.ts';
import { totalRows } from '../../../lib/standings.ts';
import type { StandingsResponse } from '../../../lib/types/api.ts';
import { Logo } from '../../../ui/logo.tsx';
import { space, v } from '../../../ui/theme.ts';
import { ClubCrest } from '../clubs/club-crest.tsx';
import type { MatchesModel } from '../clubs/matches.ts';
import { SPRING, Value, clamp } from '../motion.ts';
import { countRender } from '../perf/renders.ts';
import { competitionMark } from '../standings/standings-sheet.tsx';
import { formDotsStyles } from './parts.tsx';
import { selectionKey, type Selection } from './selection.ts';

// The sidebar shows more the wider it is: crests with a countdown badge at the rail, then names,
// then a detail line, then form. Each tier fades in over its own band of widths, so whatever
// width it's left at reads as a designed state rather than truncated text.

/** Width of the crest rail, in px (pointer math). */
export const RAIL_PX = 76;

const progress = (value: number, from: number, to: number) => clamp((value - from) / (to - from), 0, 1);

/** Sizes the sidebar and sets its tiers for a width. Called every frame while it's dragged. */
export function paintSidebar(element: HTMLElement, width: number) {
  element.style.width = `${width}px`;
  element.style.setProperty('--a', progress(width, 104, 150).toFixed(3));
  element.style.setProperty('--b', progress(width, 190, 236).toFixed(3));
  element.style.setProperty('--c', progress(width, 286, 320).toFixed(3));
  element.style.setProperty('--r', (1 - progress(width, 92, 128)).toFixed(3));
  element.toggleAttribute('data-rail', width < 128);
}

type Props = {
  clubs: Club[];
  standings: StandingsResponse[];
  matches: MatchesModel;
  clock: Clock;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onEdit: (button: HTMLButtonElement) => void;
  setElement: (element: HTMLElement) => void;
};

export function Sidebar(handle: Handle<Props>) {
  let lens: HTMLElement | undefined;
  let list: HTMLElement | undefined;
  let lensKey: string | null = null;
  const lensY = new Value(0, (y) => {
    if (lens) lens.style.transform = `translate3d(0, ${y}px, 0)`;
  });
  handle.signal.addEventListener('abort', () => lensY.stop());

  // The lens glides to the picked item; the first placement doesn't animate.
  function placeLens() {
    const key = selectionKey(handle.props.selection);
    const item = list?.querySelector<HTMLElement>(`[data-item="${key}"]`);
    if (!lens) return;
    lens.style.opacity = item ? '1' : '0';
    if (!item) return;
    if (lensKey === null) {
      lensY.set(item.offsetTop);
      lens.style.transform = `translate3d(0, ${item.offsetTop}px, 0)`;
    } else if (lensKey !== key || lensY.target !== item.offsetTop) {
      lensY.to(item.offsetTop, { spring: SPRING.settle });
    }
    lensKey = key;
  }

  return () => {
    countRender('Sidebar');
    const { clubs, standings, matches, clock, selection, onSelect, onEdit, setElement } = handle.props;
    const selected = selectionKey(selection);
    handle.queueTask(placeLens);

    return (
      <aside aria-label='Your clubs and competitions' mix={[sidebarStyles, ref((node) => setElement(node))]}>
        <div mix={scrollStyles}>
          <div mix={[listStyles, ref((node) => (list = node))]}>
            <span aria-hidden='true' mix={[lensStyles, ref((node) => (lens = node))]} />
            <header mix={headStyles}>
              <Logo size={space(8)} />
              <span data-tier='a' mix={brandStyles}>
                <b>On the Pitch</b>
                <span>{today(clock)}</span>
              </span>
            </header>
            <p mix={sectionStyles}>
              <span data-tier='a'>Your clubs · {clubs.length}</span>
              <button
                type='button'
                data-clubs-opener
                data-tier='a'
                mix={[editStyles, on('click', (event) => onEdit(event.currentTarget))]}
              >
                Edit
              </button>
            </p>
            <div mix={itemsStyles}>
              {clubs.map((club) => {
                const entry = matches.get(club.id);
                const clubMatches = entry && entry.status !== 'error' ? entry.matches : undefined;
                const next = clubMatches?.fixtures[0];
                const when = next ? soon(new Date(next.utcDate), clock) : '';
                const key = selectionKey({ kind: 'club', id: club.id });
                return (
                  <button
                    key={key}
                    type='button'
                    data-item={key}
                    aria-label={club.name}
                    aria-current={key === selected ? 'page' : undefined}
                    mix={[itemStyles, on('click', () => onSelect({ kind: 'club', id: club.id }))]}
                  >
                    <span mix={iconStyles}>
                      <ClubCrest crest={club.crest} size={space(8)} />
                      {when && <small mix={badgeStyles}>{when}</small>}
                    </span>
                    <span mix={textStyles}>
                      <b data-tier='a'>{club.name}</b>
                      <small data-tier='b'>
                        {ordinal(club.position)} {getCompetitionMetadata(club.competitionCode).short}
                        {next && ` · ${when} ${next.venue === 'H' ? 'vs' : 'at'} ${next.opponent.tla || next.opponent.name}`}
                      </small>
                    </span>
                    {clubMatches && (
                      <span data-tier='c' mix={[formDotsStyles, dotsStyles]} aria-hidden='true'>
                        {clubMatches.form.map((match, i) => (
                          <i key={i} data-r={match.result} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p mix={sectionStyles}>
              <span data-tier='a'>Competitions</span>
            </p>
            <div mix={itemsStyles}>
              {standings.map((standing) => {
                const code = standing.competition.code;
                const metadata = getCompetitionMetadata(code);
                const rows = totalRows(standing);
                const key = selectionKey({ kind: 'competition', code });
                const yours = clubs.flatMap((club) => {
                  const row = rows.find((r) => r.team.id === club.id);
                  return row ? [`${row.team.tla || club.name} ${ordinal(row.position)}`] : [];
                });
                return (
                  <button
                    key={key}
                    type='button'
                    data-item={key}
                    aria-label={standing.competition.name}
                    aria-current={key === selected ? 'page' : undefined}
                    mix={[itemStyles, on('click', () => onSelect({ kind: 'competition', code }))]}
                  >
                    <span mix={iconStyles}>
                      <span
                        mix={[competitionMark, markStyles]}
                        style={{ '--competition': metadata.color, '--competition-accent': metadata.accent }}
                        aria-hidden='true'
                      >
                        {metadata.mark}
                      </span>
                    </span>
                    <span mix={textStyles}>
                      <b data-tier='a'>{standing.competition.name}</b>
                      {yours.length > 0 && <small data-tier='b'>{yours.join(' · ')}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    );
  };
}

// ───────── styles ─────────

const ITEM = space(13);
const RAIL_INSET = `calc((${RAIL_PX}px - ${space(8)}) / 2)`;

const sidebarStyles = css({
  '--a': '0',
  '--b': '0',
  '--c': '0',
  '--r': '1',
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  zIndex: 4,
  width: `${RAIL_PX}px`,
  contain: 'layout paint',
  background: v('--color-bg'),
  boxShadow: `inset -1px 0 0 ${v('--color-separator')}`,
  touchAction: 'pan-y',
  transition: `box-shadow 200ms ${v('--ease-out')}, background-color 200ms ${v('--ease-out')}`,

  '& [data-tier="a"]': { opacity: 'var(--a)' },
  '& [data-tier="b"]': { opacity: 'var(--b)' },
  '& [data-tier="c"]': { opacity: 'var(--c)' },

  // At the rail, words are invisible; they mustn't catch taps or focus either.
  '&[data-rail] button[data-tier="a"]': {
    visibility: 'hidden',
  },

  // Out over the content it becomes a raised surface.
  '&[data-floating]': {
    background: v('--color-surface'),
    boxShadow: `inset -1px 0 0 ${v('--color-separator')}, 1.5rem 0 3rem oklch(0% 0 0 / 0.45)`,
  },
});

const scrollStyles = css({
  position: 'absolute',
  inset: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'none',

  '&::-webkit-scrollbar': {
    display: 'none',
  },
});

const listStyles = css({
  position: 'relative',
  padding: `calc(${v('--safe-area-inset-top')} + ${space(4)}) 0 calc(${v('--safe-area-inset-bottom')} + ${space(6)})`,
});

const lensStyles = css({
  position: 'absolute',
  top: 0,
  left: space(2),
  right: space(2),
  zIndex: 0,
  height: ITEM,
  borderRadius: v('--radius-md'),
  background: v('--card-fill'),
  boxShadow: `${v('--shadow-highlight')}, 0 0 0 1px ${v('--color-separator')}`,
  opacity: 0,
  pointerEvents: 'none',
  willChange: 'transform',

  '[data-floating] &': {
    background: v('--color-surface-raised'),
  },
});

const headStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  height: space(12),
  marginBottom: space(2),
  paddingLeft: RAIL_INSET,
  whiteSpace: 'nowrap',
});

const brandStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(1),
  minWidth: 0,

  '& b': {
    fontSize: v('--text-xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
  },

  '& span': {
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    textTransform: 'uppercase',
  },
});

// At the rail a section label becomes a short rule, so the crests still read as two groups.
const sectionStyles = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  height: space(10),
  padding: `${space(4)} ${space(4)} 0 ${space(5)}`,
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),
  whiteSpace: 'nowrap',

  '&::before': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: `${(RAIL_PX - 24) / 2}px`,
    width: '24px',
    height: '1px',
    background: v('--color-outline'),
    opacity: 'var(--r)',
  },
});

const editStyles = css({
  margin: `${space(-1)} 0`,
  padding: `${space(1)} ${space(0.5)} ${space(1)} ${space(2.5)}`,
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-semibold'),
  textTransform: 'none',
  color: v('--color-accent'),
  transition: `opacity 140ms ${v('--ease-out')}`,

  '&:active': {
    opacity: 0.5,
  },
});

const itemsStyles = css({
  display: 'flex',
  flexDirection: 'column',
});

const itemStyles = css({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  width: '100%',
  height: ITEM,
  padding: `0 ${space(4)} 0 ${RAIL_INSET}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',

  '&:focus-visible': {
    outline: `2px solid ${v('--color-accent')}`,
    outlineOffset: '-4px',
    borderRadius: v('--radius-md'),
  },

  // Form dots sit over the row's right end and only claim room once they show, so a hidden
  // tier never squeezes the name out.
  '&:has([data-tier="c"]) > span:nth-child(2)': {
    paddingRight: 'calc(var(--c) * 4.25rem)',
  },
});

const iconStyles = css({
  position: 'relative',
  flex: 'none',
});

const markStyles = css({
  '--mark-size': space(8),
});

const badgeStyles = css({
  position: 'absolute',
  left: '50%',
  bottom: '-6px',
  padding: '1px 4px',
  borderRadius: v('--radius-full'),
  background: v('--color-float'),
  boxShadow: `0 0 0 1px ${v('--color-separator')}`,
  fontSize: v('--text-4xs'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-text'),
  whiteSpace: 'nowrap',
  opacity: 'var(--r)',
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
});

const textStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1),
  minWidth: 0,

  '& b': {
    overflow: 'hidden',
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-bold'),
    letterSpacing: v('--tracking-tight'),
    textOverflow: 'ellipsis',
  },

  '& small': {
    overflow: 'hidden',
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    textOverflow: 'ellipsis',
  },
});

const dotsStyles = css({
  position: 'absolute',
  top: '50%',
  right: space(4),
  transform: 'translateY(-50%)',
});
