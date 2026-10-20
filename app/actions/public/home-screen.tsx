import { clientEntry, css, on, type Handle } from 'remix/component';

import type { StandingsResponse } from '../../lib/types/api.ts';
import { Logo } from '../../ui/logo.tsx';
import { Standings } from './standings/index.tsx';
import { Sheet } from './standings/sheet.tsx';
import { countRender } from './perf/renders.ts';
import { space, v } from '../../ui/theme.ts';

const RECEDED_SCREEN_SCALE = 0.93;
const OVERLAY_OPEN_OPACITY = 0.45;

export const HomeScreen = clientEntry(
  import.meta.url,
  function HomeScreen(handle: Handle<{ standings: StandingsResponse[] }>) {
    let selected: StandingsResponse | null = null;
    let open = false;
    let dragOpenFraction: number | null = null;
    let opener: HTMLButtonElement | undefined;
    let closeButton: HTMLButtonElement | undefined;

    async function show(standing: StandingsResponse, button: HTMLButtonElement) {
      opener = button;
      selected = standing;
      open = true;

      const signal = await handle.update();
      if (!signal.aborted && open) {
        closeButton?.focus({ preventScroll: true });
      }
    }

    async function close() {
      open = false;

      const signal = await handle.update();
      if (!signal.aborted && !open && opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    }

    return () => {
      countRender('HomeScreen');
      const openFraction = dragOpenFraction ?? (open ? 1 : 0);
      const isDragging = dragOpenFraction !== null;

      return (
        <div
          mix={containerStyles}
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
              <Standings standings={handle.props.standings} onSelect={show} />
            </section>

            <section></section>
          </main>

          <button
            type='button'
            aria-label='Close standings'
            tabIndex={-1}
            inert={!open}
            mix={[overlayStyles, on('click', close)]}
            style={{
              opacity: openFraction * OVERLAY_OPEN_OPACITY,
              pointerEvents: open ? 'auto' : 'none',
            }}
          />

          <Sheet
            standing={selected}
            open={open}
            onClose={close}
            onDragOpenFraction={(fraction) => {
              dragOpenFraction = fraction;
              handle.update();
            }}
            closeButtonRef={(button) => {
              closeButton = button;
            }}
          />
        </div>
      );
    };
  },
);

const containerStyles = css({
  position: 'relative',
  isolation: 'isolate',
  height: `calc(100% + ${v('--safe-area-inset-top')} + ${v('--safe-area-inset-bottom')})`,
  marginTop: `calc(-1 * ${v('--safe-area-inset-top')})`,
  marginBottom: `calc(-1 * ${v('--safe-area-inset-bottom')})`,
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

const overlayStyles = css({
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  background: v('--color-black'),
  transitionProperty: 'opacity',
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

const titleStyles = css({
  fontSize: v('--text-2xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
});
