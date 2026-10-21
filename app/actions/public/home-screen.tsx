import { clientEntry, css, on, ref, type Handle } from 'remix/component';

import { clubSections, leagueLeaders } from '../../lib/clubs.ts';
import { followsCookie } from '../../lib/follows.ts';
import type { StandingsResponse } from '../../lib/types/api.ts';
import { Logo } from '../../ui/logo.tsx';
import { BuildYourStack } from './clubs/build-your-stack.tsx';
import { ClubPicker } from './clubs/club-picker.tsx';
import { Standings } from './standings/index.tsx';
import { StandingsSheet } from './standings/standings-sheet.tsx';
import { Sheet } from './sheet.tsx';
import { countRender } from './perf/renders.ts';
import { space, v } from '../../ui/theme.ts';

const RECEDED_SCREEN_SCALE = 0.93;
const STACK_PREVIEW_CLUBS = 3;

type Props = { standings: StandingsResponse[]; follows: number[] };

type SheetContent =
  | { kind: 'standings'; standing: StandingsResponse }
  | { kind: 'clubs'; session: number };

export const HomeScreen = clientEntry(
  import.meta.url,
  function HomeScreen(handle: Handle<Props>) {
    const sections = clubSections(handle.props.standings);
    const stackPreview = leagueLeaders(handle.props.standings, STACK_PREVIEW_CLUBS);
    const knownClubs = new Set(sections.flatMap((section) => section.clubs.map((club) => club.id)));
    const titleId = `${handle.id}-sheet-title`;
    let follows = handle.props.follows.filter((id) => knownClubs.has(id));
    let draft = follows;
    let pickerSessions = 0;
    let content: SheetContent | null = null;
    let open = false;
    let dragOpenFraction: number | null = null;
    let opener: HTMLButtonElement | undefined;
    let root: HTMLElement | undefined;

    async function show(next: SheetContent, button: HTMLButtonElement) {
      opener = button;
      content = next;
      open = true;

      const signal = await handle.update();
      if (!signal.aborted && open) {
        root
          ?.querySelector<HTMLElement>('[role="dialog"] [data-sheet-autofocus]')
          ?.focus({ preventScroll: true });
      }
    }

    function showStandings(standing: StandingsResponse, button: HTMLButtonElement) {
      show({ kind: 'standings', standing }, button);
    }

    function chooseClubs(button: HTMLButtonElement) {
      draft = follows;
      show({ kind: 'clubs', session: ++pickerSessions }, button);
    }

    function commitDraft() {
      if (draft.join() === follows.join()) return;
      follows = draft;
      document.cookie = followsCookie(follows);
    }

    async function close() {
      if (open && content?.kind === 'clubs') commitDraft();
      open = false;

      const signal = await handle.update();
      if (signal.aborted || open) return;
      const returnTo = opener?.isConnected
        ? opener
        : root?.querySelector<HTMLElement>('main [data-clubs-opener]');
      returnTo?.focus({ preventScroll: true });
    }

    return () => {
      countRender('HomeScreen');
      const openFraction = dragOpenFraction ?? (open ? 1 : 0);
      const isDragging = dragOpenFraction !== null;

      return (
        <div
          mix={[
            containerStyles,
            ref((node) => {
              root = node;
            }),
          ]}
          style={{
            '--sheet-duration': isDragging
              ? '0ms'
              : v(open ? '--duration-sheet-open' : '--duration-sheet-close'),
          }}
        >
          <main
            mix={screenStyles}
            inert={open}
            style={{
              transform: `scale(${1 - openFraction * (1 - RECEDED_SCREEN_SCALE)})`,
              borderRadius: `calc(${v('--radius-lg')} * ${openFraction})`,
            }}
          >
            <header mix={headerStyles}>
              <p mix={subtitleStyles}>Saturday 10 October</p>
              <div data-perf-toggle mix={brandStyles}>
                <Logo size={space(7.5)} />
                <h3 mix={titleStyles}>On the Pitch</h3>
              </div>
            </header>

            <section mix={sectionStyles}>
              <p mix={[subtitleStyles, insetStyles]}>Competitions</p>
              <Standings standings={handle.props.standings} onSelect={showStandings} />
            </section>

            <section mix={clubsSectionStyles}>
              <p mix={[subtitleStyles, insetStyles, clubsLabelStyles]}>
                {follows.length ? `Your clubs · ${follows.length}` : 'Your clubs'}
                {follows.length > 0 && (
                  <button
                    type='button'
                    data-clubs-opener
                    mix={[editStyles, on('click', (event) => chooseClubs(event.currentTarget))]}
                  >
                    Edit
                  </button>
                )}
              </p>
              {follows.length === 0 && (
                <BuildYourStack preview={stackPreview} onChoose={chooseClubs} />
              )}
            </section>
          </main>

          <Sheet
            open={open}
            labelledBy={content ? titleId : undefined}
            onClose={close}
            onDragOpenFraction={(fraction) => {
              dragOpenFraction = fraction;
              handle.update();
            }}
          >
            {content?.kind === 'standings' && (
              <StandingsSheet standing={content.standing} titleId={titleId} onClose={close} />
            )}
            {content?.kind === 'clubs' && (
              <ClubPicker
                key={content.session}
                sections={sections}
                initial={follows}
                titleId={titleId}
                onChange={(ids) => {
                  draft = ids;
                }}
                onDone={close}
              />
            )}
          </Sheet>
        </div>
      );
    };
  },
);

const containerStyles = css({
  position: 'fixed',
  inset: 0,
  isolation: 'isolate',
  overflow: 'hidden',
  background: v('--color-black'),
});

const screenStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  height: '100%',
  overflow: 'clip',
  background: v('--color-bg'),
  transformOrigin: '50% 50%',
  transitionProperty: 'transform, border-radius',
  transitionDuration: 'var(--sheet-duration)',
  transitionTimingFunction: v('--ease-ios'),
});

const headerStyles = css({
  padding: `calc(${v('--safe-area-inset-top')} + ${space(3.5)}) ${v('--gutter')} 0`,
});

const insetStyles = css({
  padding: `0 ${v('--gutter')}`,
});

const brandStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2.5),
  touchAction: 'manipulation',
  userSelect: 'none',
  WebkitUserSelect: 'none',
});

const sectionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
});

const subtitleStyles = css({
  textTransform: 'uppercase',
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  color: v('--color-text-secondary'),
});

const clubsSectionStyles = css({
  flex: '1',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(3)})`,
});

const clubsLabelStyles = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
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

const titleStyles = css({
  fontSize: v('--text-2xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
});
