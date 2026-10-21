import { css, on, ref, type Dispatched, type Handle } from 'remix/component';

import type { Club, ClubSection } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { FAVOURITES } from '../../../lib/follows.ts';
import { hideScrollbar, space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { sheetGrab, sheetScroll } from '../sheet.tsx';
import { competitionMark } from '../standings/standings-sheet.tsx';
import { ClubCrest } from './club-crest.tsx';

type Props = {
  sections: ClubSection[];
  initial: number[];
  titleId: string;
  onChange: (ids: number[]) => void;
  onDone: () => void;
};

const SPY_LOCK_MS = 700;
const SPY_OFFSET_PX = 24;
const FLY_MS = 520;
const CHIP_EXIT_MS = 240;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const tick = () => navigator.vibrate?.(8);

function countText(count: number) {
  if (!count) return 'Pick as many as you like';
  if (count > FAVOURITES + 1) return `${count} clubs · first ${FAVOURITES} stay on top`;
  return `${count} club${count === 1 ? '' : 's'}`;
}

export function ClubPicker(handle: Handle<Props>) {
  const clubs = new Map<number, Club>(
    handle.props.sections.flatMap((section) => section.clubs.map((club) => [club.id, club])),
  );
  let tray = handle.props.initial.filter((id) => clubs.has(id));
  const leaving = new Map<number, Animation | null>();
  const ripples = new Map<number, { x: number; y: number }>();
  let query = '';
  let activeSection = handle.props.sections[0]?.code;
  let bumps = 0;
  let spyLockUntil = 0;
  let trayEl: HTMLElement | undefined;
  let scrollEl: HTMLElement | undefined;
  let railEl: HTMLElement | undefined;

  const picked = () => tray.filter((id) => !leaving.has(id));

  function changed() {
    bumps++;
    handle.props.onChange(picked());
    tick();
  }

  async function add(id: number, tile: HTMLElement) {
    if (leaving.has(id)) {
      leaving.get(id)?.cancel();
      leaving.delete(id);
      tray = tray.filter((other) => other !== id);
    }
    tray = [...tray, id];
    changed();
    const signal = await handle.update();
    if (signal.aborted || !trayEl) return;
    trayEl.scrollLeft = trayEl.scrollWidth;
    const chip = trayEl.querySelector<HTMLElement>(`[data-chip="${id}"]`);
    const crest = tile.querySelector<HTMLElement>('[data-club-crest]');
    if (chip && crest) fly(crest, chip);
  }

  async function remove(id: number) {
    if (leaving.has(id) || !tray.includes(id)) return;
    if (reducedMotion()) {
      tray = tray.filter((other) => other !== id);
      changed();
      await handle.update();
      return;
    }

    leaving.set(id, null);
    changed();
    await handle.update();
    const chip = trayEl?.querySelector<HTMLElement>(`[data-chip="${id}"]`);
    if (!chip || leaving.get(id) !== null) return;
    const exit = chip.animate(
      [
        { width: space(10), marginRight: space(1.5), opacity: 1, transform: 'scale(1)' },
        { width: '0px', marginRight: '0px', opacity: 0, transform: 'scale(0.4)' },
      ],
      { duration: CHIP_EXIT_MS, easing: EASE_OUT, fill: 'forwards' },
    );
    leaving.set(id, exit);
    exit.finished.then(
      () => {
        if (leaving.get(id) !== exit) return;
        leaving.delete(id);
        tray = tray.filter((other) => other !== id);
        handle.update();
      },
      () => {},
    );
  }

  function fly(from: HTMLElement, to: HTMLElement) {
    if (reducedMotion()) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = from.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: 'fixed',
      zIndex: '100',
      margin: '0',
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      pointerEvents: 'none',
      boxShadow: 'var(--shadow-card)',
    });
    document.body.append(ghost);

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const scale = b.width / a.width;
    to.animate([{ opacity: 0 }, { opacity: 0 }], { duration: FLY_MS });
    ghost
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)' },
          {
            transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(${(1 + scale) / 2 + 0.08})`,
            offset: 0.45,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        ],
        { duration: FLY_MS, easing: EASE_IOS },
      )
      .finished.finally(() => {
        ghost.remove();
        to.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
          duration: 260,
          easing: EASE_OUT,
        });
      });
  }

  function toggle(event: Dispatched<MouseEvent, HTMLButtonElement>, id: number) {
    const tile = event.currentTarget;
    const rect = tile.getBoundingClientRect();
    ripples.set(id, {
      x: event.clientX ? event.clientX - rect.left : rect.width / 2,
      y: event.clientY ? event.clientY - rect.top : rect.height / 2,
    });
    if (picked().includes(id)) remove(id);
    else add(id, tile);
  }

  function removeFromTray(id: number) {
    ripples.delete(id);
    remove(id);
  }

  async function jump(code: string) {
    const section = scrollEl?.querySelector<HTMLElement>(`[data-section="${code}"]`);
    if (!scrollEl || !section) return;
    spyLockUntil = performance.now() + SPY_LOCK_MS;
    await activate(code);
    scrollEl.scrollTo({
      top: section.offsetTop - 4,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }

  async function activate(code: string) {
    if (activeSection === code) return;
    activeSection = code;
    const signal = await handle.update();
    if (signal.aborted) return;
    railEl?.querySelector(`[data-section-chip="${code}"]`)?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }

  function spy() {
    if (query || !scrollEl || performance.now() < spyLockUntil) return;
    const top = scrollEl.scrollTop;
    const atBottom = top + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
    const sections = Array.from(scrollEl.querySelectorAll<HTMLElement>('[data-section]'));
    const current = atBottom
      ? sections.at(-1)
      : sections.filter((section) => section.offsetTop - SPY_OFFSET_PX <= top).at(-1) ??
        sections[0];
    const code = current?.dataset.section;
    if (code) activate(code);
  }

  function search(value: string) {
    query = fold(value.trim());
    if (scrollEl) scrollEl.scrollTop = 0;
    handle.update();
  }

  return () => {
    countRender('ClubPicker');
    const { sections, titleId, onDone } = handle.props;
    const selected = picked();
    const folding = selected.length > FAVOURITES + 1;
    const visible = sections
      .map((section) => ({
        ...section,
        clubs: query
          ? section.clubs.filter((club) =>
              fold(`${club.name} ${club.fullName}`).includes(query),
            )
          : section.clubs,
      }))
      .filter((section) => section.clubs.length > 0);
    let shownChips = 0;

    return (
      <>
        <div data-sheet-grab mix={[sheetGrab, headStyles]}>
          <div mix={topStyles}>
            <div mix={titleStyles}>
              <b id={titleId}>Your clubs</b>
              <span key={bumps} mix={bumps ? bumpStyles : undefined}>
                {countText(selected.length)}
              </span>
            </div>
            <button
              type='button'
              data-sheet-autofocus
              mix={[doneStyles, on('click', onDone)]}
            >
              Done
            </button>
          </div>

          <div
            data-no-drag
            mix={[
              trayStyles,
              hideScrollbar,
              ref((node) => {
                trayEl = node;
              }),
            ]}
          >
            {selected.length === 0 && (
              <p mix={trayHintStyles}>Tap a club to deal its card into your stack</p>
            )}
            {tray.map((id) => {
              const club = clubs.get(id)!;
              const isLeaving = leaving.has(id);
              const startsFold = !isLeaving && folding && shownChips === FAVOURITES;
              if (!isLeaving) shownChips++;
              return (
                <button
                  key={id}
                  type='button'
                  data-chip={id}
                  aria-label={`Remove ${club.name}`}
                  inert={isLeaving}
                  mix={[
                    chipStyles,
                    startsFold && foldStyles,
                    on('click', () => removeFromTray(id)),
                  ]}
                >
                  <ClubCrest crest={club.crest} size={space(10)} />
                </button>
              );
            })}
          </div>

          <label mix={searchStyles}>
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              stroke-width='2.2'
              stroke-linecap='round'
              aria-hidden='true'
            >
              <circle cx='11' cy='11' r='7' />
              <path d='m20 20-3.5-3.5' />
            </svg>
            <input
              type='search'
              placeholder='Search clubs'
              aria-label='Search clubs'
              autocomplete='off'
              enterKeyHint='search'
              mix={on('input', (event) => search(event.currentTarget.value))}
            />
          </label>

          <div
            data-no-drag
            mix={[
              railStyles,
              hideScrollbar,
              query && mutedStyles,
              ref((node) => {
                railEl = node;
              }),
            ]}
          >
            {sections.map((section) => {
              const metadata = getCompetitionMetadata(section.code);
              return (
                <button
                  key={section.code}
                  type='button'
                  data-section-chip={section.code}
                  aria-pressed={section.code === activeSection ? 'true' : 'false'}
                  mix={[railChipStyles, on('click', () => jump(section.code))]}
                >
                  <span
                    mix={competitionMark}
                    style={{
                      '--competition': metadata.color,
                      '--competition-accent': metadata.accent,
                      '--mark-size': space(4),
                      boxShadow: 'none',
                    }}
                    aria-hidden='true'
                  >
                    {metadata.mark}
                  </span>
                  {section.name}
                </button>
              );
            })}
          </div>
        </div>

        <div
          mix={[
            sheetScroll,
            bodyStyles,
            ref((node) => {
              scrollEl = node;
            }),
            on('scroll', spy),
          ]}
        >
          {visible.map((section) => (
            <section key={section.code} data-section={section.code}>
              <h3 mix={sectionTitleStyles}>{section.name}</h3>
              <div
                mix={gridStyles}
                style={{ '--club': getCompetitionMetadata(section.code).color }}
              >
                {section.clubs.map((club) => {
                  const ripple = ripples.get(club.id);
                  return (
                    <button
                      key={club.id}
                      type='button'
                      aria-pressed={selected.includes(club.id) ? 'true' : 'false'}
                      mix={[tileStyles, on('click', (event) => toggle(event, club.id))]}
                      style={
                        ripple ? { '--rx': `${ripple.x}px`, '--ry': `${ripple.y}px` } : undefined
                      }
                    >
                      <ClubCrest crest={club.crest} size={space(11)} />
                      <b>{club.name}</b>
                      <span mix={checkStyles} aria-hidden='true'>
                        <svg
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          stroke-width='3.4'
                          stroke-linecap='round'
                          stroke-linejoin='round'
                        >
                          <path d='m5 12.5 4.5 4.5L19 7.5' />
                        </svg>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {visible.length === 0 && (
            <p mix={noneStyles}>No clubs match “{query}”</p>
          )}
        </div>
      </>
    );
  };
}

const headStyles = css({
  padding: `${space(5.5)} 0 ${space(2.5)}`,
});

const topStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  padding: `0 ${space(4)}`,
});

const titleStyles = css({
  flex: '1',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space(0.5),

  '& b': {
    fontSize: v('--text-xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    lineHeight: v('--leading-tight'),
  },

  '& span': {
    fontSize: v('--text-xs'),
    color: v('--color-text-secondary'),
  },
});

const bumpStyles = css({
  '@keyframes picker-count-bump': {
    from: { opacity: 0.4, transform: `translateY(${space(0.75)})` },
  },

  animation: `picker-count-bump 320ms ${v('--ease-out')}`,
});

const doneStyles = css({
  flex: 'none',
  height: space(8.5),
  padding: `0 ${space(4)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-accent-ink'),
  background: v('--color-accent'),
  transition: `transform ${v('--duration-press')} ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.94)',
  },
});

const trayStyles = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  height: space(14),
  marginTop: space(2),
  padding: `0 ${space(4)}`,
  overflowX: 'auto',
  overscrollBehaviorX: 'contain',
});

const trayHintStyles = css({
  '@keyframes picker-hint-in': {
    from: { opacity: 0 },
  },

  position: 'absolute',
  left: space(4),
  right: space(4),
  display: 'flex',
  alignItems: 'center',
  height: space(10),
  padding: `0 ${space(3.5)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-xs'),
  color: v('--color-text-tertiary'),
  boxShadow: `inset 0 0 0 1px ${v('--color-separator')}`,
  animation: `picker-hint-in 260ms ${v('--ease-out')}`,
});

const chipStyles = css({
  flex: 'none',
  width: space(10),
  height: space(10),
  marginRight: space(1.5),
  transition: `margin-left 320ms ${v('--ease-ios')}`,

  '& [data-club-crest]': {
    transition: `transform ${v('--duration-press')} ${v('--ease-out')}`,
  },

  '&:active [data-club-crest]': {
    transform: 'scale(0.9)',
  },
});

const foldStyles = css({
  position: 'relative',
  marginLeft: space(3.25),

  '&::before': {
    content: '""',
    position: 'absolute',
    left: space(-2.5),
    top: space(2),
    bottom: space(2),
    width: '1px',
    background: v('--color-separator'),
  },
});

const searchStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  height: space(9.5),
  margin: `${space(1.5)} ${space(4)} 0`,
  padding: `0 ${space(3)}`,
  borderRadius: v('--radius-md'),
  color: v('--color-text-secondary'),
  background: v('--color-surface-raised'),

  '& svg': {
    flex: 'none',
    width: space(4.25),
    height: space(4.25),
  },

  '& input': {
    flex: '1',
    minWidth: 0,
    height: '100%',
    border: 0,
    outline: 0,
    padding: 0,
    font: 'inherit',
    fontSize: v('--text-base'),
    color: v('--color-text'),
    background: 'none',
  },

  '& input::placeholder': {
    color: v('--color-text-tertiary'),
  },
});

const railStyles = css({
  display: 'flex',
  gap: space(2),
  marginTop: space(2.5),
  padding: `0 ${space(4)}`,
  overflowX: 'auto',
  transition: `opacity 200ms ${v('--ease-out')}`,
});

const mutedStyles = css({
  opacity: 0.35,
  pointerEvents: 'none',
});

const railChipStyles = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: space(1.75),
  height: space(8),
  padding: `0 ${space(3.5)} 0 ${space(2)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-text-secondary'),
  boxShadow: `inset 0 0 0 1px ${v('--color-separator')}`,
  transition: `background-color 180ms ${v('--ease-out')}, color 180ms ${v('--ease-out')}, transform ${v('--duration-press')} ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.96)',
  },

  '&[aria-pressed="true"]': {
    color: v('--color-bg'),
    background: v('--color-text'),
  },
});

const bodyStyles = css({
  paddingInline: space(4),
});

const sectionTitleStyles = css({
  margin: `${space(4.5)} ${space(1)} ${space(2)}`,
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-semibold'),
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),
});

const gridStyles = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: space(2),
});

const tileStyles = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(2),
  minWidth: 0,
  padding: `${space(3.5)} ${space(1.5)} ${space(3)}`,
  overflow: 'hidden',
  borderRadius: v('--radius-md'),
  background: v('--color-surface-raised'),
  transition: `transform 140ms ${v('--ease-out')}, color 200ms ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.95)',
  },

  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: `linear-gradient(
      160deg,
      color-mix(in oklab, var(--club) 82%, var(--color-white)) 0%,
      var(--club) 55%,
      color-mix(in oklab, var(--club) 72%, var(--color-black)) 100%
    )`,
    boxShadow: v('--shadow-highlight'),
    opacity: 0,
    clipPath: 'circle(0px at var(--rx, 50%) var(--ry, 50%))',
    transition: 'opacity 180ms ease-out, clip-path 0s 180ms',
  },

  '&[aria-pressed="true"]': {
    color: v('--color-white'),
  },

  '&[aria-pressed="true"]::before': {
    opacity: 1,
    clipPath: 'circle(160% at var(--rx, 50%) var(--ry, 50%))',
    transition: `opacity 80ms ease-out, clip-path 560ms ${v('--ease-out')}`,
  },

  '& b': {
    position: 'relative',
    maxWidth: '100%',
    fontSize: v('--text-xs'),
    fontWeight: v('--font-weight-semibold'),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  '&[aria-pressed="true"] b': {
    fontWeight: v('--font-weight-bold'),
  },
});

const checkStyles = css({
  position: 'absolute',
  top: space(2),
  right: space(2),
  display: 'grid',
  placeItems: 'center',
  width: space(5),
  height: space(5),
  borderRadius: v('--radius-full'),
  color: 'color-mix(in oklab, var(--club) 75%, var(--color-black))',
  background: v('--color-white'),
  opacity: 0,
  transform: 'scale(0.4)',
  transition: 'opacity 120ms ease-out, transform 160ms ease-out',

  '& svg': {
    width: space(3),
    height: space(3),
  },

  '[aria-pressed="true"] > &': {
    opacity: 1,
    transform: 'none',
    transition:
      'opacity 160ms ease-out 120ms, transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1) 120ms',
  },
});

const noneStyles = css({
  padding: `${space(12)} 0`,
  textAlign: 'center',
  fontSize: v('--text-sm'),
  color: v('--color-text-secondary'),
});
