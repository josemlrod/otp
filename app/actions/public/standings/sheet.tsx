import { css, on, ref, type Handle } from 'remix/component';

import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { StandingsTable } from './standings-table.tsx';

import type { StandingsResponse } from '../../../lib/types/api.ts';

type Props = {
  standing: StandingsResponse | null;
  open: boolean;
  onClose: () => void;
  closeButtonRef?: (button: HTMLButtonElement) => void;
};

export function Sheet(handle: Handle<Props>) {
  const titleId = `${handle.id}-title`;

  return () => {
    const { open, standing, onClose } = handle.props;
    const metadata = standing
      ? getCompetitionMetadata(standing.competition.code)
      : null;

    return (
      <section
        mix={[
          sheetContainer,
          on('keydown', (event) => {
            if (!handle.props.open) return;

            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              handle.props.onClose();
            }

            if (event.key === 'Tab') {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'a[href], button, input, select, textarea, [tabindex]',
                ),
              ).filter((element) =>
                element.tabIndex >= 0 &&
                !element.matches(':disabled') &&
                !element.closest('[inert]') &&
                element.getClientRects().length > 0 &&
                getComputedStyle(element).visibility === 'visible'
              );
              const first = controls[0];
              const last = controls.at(-1);

              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus({ preventScroll: true });
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus({ preventScroll: true });
              }
            }
          }),
        ]}
        role='dialog'
        aria-modal='true'
        aria-labelledby={standing ? titleId : undefined}
        aria-hidden={!open || !standing ? 'true' : 'false'}
        inert={!open || !standing}
        style={{
          transform: open ? 'translateY(0)' : 'translateY(110%)',
        }}
      >
        {standing && metadata && (
          <div
            mix={sheetBand}
            style={{
              '--c': metadata.color,
              '--ink': '#fff',
              '--ca': metadata.accent,
            }}
          >
            <span mix={competitionBadge}>
              <span
                class='cmark'
                mix={competitionMark}
                style={{ '--cm': metadata.color, '--s': '34px' }}
                aria-hidden='true'
              >
                {metadata.mark}
              </span>
            </span>
            <span mix={sheetTitle}>
              <b id={titleId}>{standing.competition.name}</b>
              <span>
                {standing.competition.code === 'CL'
                  ? 'League phase'
                  : 'Matchday'}{' '}
                {standing.season.currentMatchday}
                {metadata.rounds != null && ` of ${metadata.rounds}`}
              </span>
            </span>
            <button
              type='button'
              mix={[
                sheetClose,
                ref((button) => handle.props.closeButtonRef?.(button)),
                on('click', onClose),
              ]}
              aria-label='Close'
            >
              <svg
                viewBox='0 0 24 24'
                width='16'
                height='16'
                fill='none'
                stroke='currentColor'
                stroke-width='2.6'
                stroke-linecap='round'
                aria-hidden='true'
              >
                <path d='M18 6 6 18M6 6l12 12' />
              </svg>
            </button>
          </div>
        )}
        {standing && (
          <div mix={sheetScroll} tabIndex={0}>
            <StandingsTable standing={standing} />
          </div>
        )}
      </section>
    );
  };
}

const sheetContainer = css({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 'calc(var(--safe-top, var(--safe-area-inset-top, 0px)) + 10px)',
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: '18px 18px 0 0',
  background: 'var(--surface)',
  boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
  transform: 'translateY(110%)',
  transitionProperty: 'transform',
  transitionDuration: 'var(--sheet-duration, 480ms)',
  transitionTimingFunction: 'var(--ease-ios)',
  touchAction: 'auto',
  willChange: 'transform',
  '--surface-in': 'var(--surface-2)',

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

const sheetGrab = css({
  position: 'relative',
  flex: 'none',
  touchAction: 'none',
  cursor: 'grab',
});

const sheetHandle = css({
  position: 'absolute',
  top: 6,
  left: '50%',
  zIndex: 2,
  width: 36,
  height: 5,
  borderRadius: 3,
  background: 'rgba(255, 255, 255, 0.45)',
  transform: 'translateX(-50%)',
});

const sheetScroll = css({
  position: 'relative',
  flex: '1 1 0%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  touchAction: 'pan-y',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'none',
  paddingBottom:
    'calc(var(--safe-bottom, var(--safe-area-inset-bottom, 0px)) + 24px)',

  '&::-webkit-scrollbar': {
    display: 'none',
  },
});

const sheetBand = css({
  position: 'relative',
  flexShrink: 0,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '22px 16px 16px',
  color: 'var(--ink)',
  background: `linear-gradient(
    165deg,
    color-mix(in oklab, var(--c) 82%, white) 0px,
    var(--c) 120px,
    color-mix(in oklab, var(--c) 72%, black) 360px
  )`,
});

const competitionBadge = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: 50,
  height: 50,
  borderRadius: '50%',
  background: 'none',
  boxShadow: 'none',

  '& .cmark': {
    boxShadow: `
      inset 0 0 0 1px rgba(255, 255, 255, 0.25),
      0 4px 12px rgba(0, 0, 0, 0.3)
    `,
  },
});

const sheetTitle = css({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,

  '& b': {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },

  '& > span': {
    fontSize: 13,
    opacity: 0.75,
  },
});

const sheetClose = css({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: 34,
  height: 34,
  borderRadius: '50%',
  background: 'color-mix(in srgb, var(--ink) 18%, transparent)',
  transition: 'transform 120ms ease-out',

  '&:active': {
    transform: 'scale(0.9)',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:active': {
      transform: 'none',
    },
  },

  '& svg': {
    width: 16,
    height: 16,
  },

  '&[aria-pressed="true"] svg': {
    fill: 'currentColor',
  },

  font: 'inherit',
  color: 'inherit',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  touchAction: 'manipulation',
});

const competitionMark = css({
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--s)',
  height: 'var(--s)',
  borderRadius: 'calc(var(--s) * 0.3)',
  background: 'var(--cm)',
  color: 'var(--ca)',
  fontSize: 'calc(var(--s) * 0.44)',
  fontWeight: 850,
  fontStyle: 'normal',
  letterSpacing: '-0.02em',
  lineHeight: 1,
  boxShadow: 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.22)',
});
