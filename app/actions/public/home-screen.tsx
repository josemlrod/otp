import { clientEntry, css, on, type Handle } from 'remix/component';

import type { StandingsResponse } from '../../lib/types/api.ts';
import { Logo } from '../../ui/logo.tsx';
import { Standings } from './standings/index.tsx';
import { Sheet } from './standings/sheet.tsx';

export const HomeScreen = clientEntry(
  import.meta.url,
  function HomeScreen(handle: Handle<{ standings: StandingsResponse[] }>) {
    let selected: StandingsResponse | null = null;
    let open = false;
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

    return () => (
      <div
        mix={containerStyles}
        style={{ '--sheet-duration': open ? '480ms' : '340ms' }}
      >
        <main
          mix={screenStyles}
          inert={open}
          style={{
            transform: open ? 'scale(0.93)' : 'scale(1)',
            borderRadius: open ? '18px' : '0px',
          }}
        >
          <header
            mix={css({
              padding: 'calc(var(--safe-area-inset-top, 0px) + 14px) 22px 0',
            })}
          >
            <p mix={subtitleStyles}>Saturday 10 October</p>
            <div mix={css({ display: 'flex', alignItems: 'center', gap: 10 })}>
              <Logo size={30} />
              <h3 mix={titleStyles}>On the Pitch</h3>
            </div>
          </header>

          <section
            mix={css({
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '0 0 0 22px',
            })}
          >
            <p mix={subtitleStyles}>Competitions</p>
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
            opacity: open ? 0.45 : 0,
            pointerEvents: open ? 'auto' : 'none',
          }}
        />

        <Sheet
          standing={selected}
          open={open}
          onClose={close}
          closeButtonRef={(button) => {
            closeButton = button;
          }}
        />
      </div>
    );
  },
);

const containerStyles = css({
  position: 'relative',
  isolation: 'isolate',
  // Extend into the safe areas already reserved by Document, then inset content.
  height: 'calc(100% + var(--safe-area-inset-top, 0px) + var(--safe-area-inset-bottom, 0px))',
  marginTop: 'calc(0px - var(--safe-area-inset-top, 0px))',
  marginBottom: 'calc(0px - var(--safe-area-inset-bottom, 0px))',
  overflow: 'hidden',
  background: '#000',
});

const screenStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  height: '100%',
  overflow: 'clip',
  background: 'var(--bg)',
  transformOrigin: '50% 50%',
  transitionProperty: 'transform, border-radius',
  transitionDuration: 'var(--sheet-duration)',
  transitionTimingFunction: 'var(--ease-ios)',

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

const overlayStyles = css({
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  background: '#000',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  transitionProperty: 'opacity',
  transitionDuration: 'var(--sheet-duration)',
  transitionTimingFunction: 'var(--ease-ios)',

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

const subtitleStyles = css({
  textTransform: 'uppercase',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  fontSize: 13,
});

const titleStyles = css({
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '-0.035em',
});
