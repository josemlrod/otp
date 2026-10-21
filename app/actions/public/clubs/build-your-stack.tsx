import { css, on, type Handle } from 'remix/component';

import type { Club } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { space, v } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { ClubCrest } from './club-crest.tsx';

type Props = {
  preview: Club[];
  onChoose: (button: HTMLButtonElement) => void;
};

export function BuildYourStack(handle: Handle<Props>) {
  return () => {
    countRender('BuildYourStack');
    const { preview, onChoose } = handle.props;
    const middle = (preview.length - 1) / 2;

    return (
      <article mix={cardStyles}>
        <div mix={fanStyles} aria-hidden='true'>
          {preview.map((club, index) => (
            <span
              key={club.id}
              mix={miniCardStyles}
              style={{
                '--club': getCompetitionMetadata(club.competitionCode).color,
                '--k': String(index - middle),
                zIndex: index === Math.round(middle) ? 1 : undefined,
              }}
            >
              <ClubCrest crest={club.crest} size={space(7.5)} />
              <i />
              <i />
            </span>
          ))}
        </div>
        <h2 mix={titleStyles}>Build your stack</h2>
        <p mix={bodyStyles}>
          Each club you follow gets a card here with its form, league position and next match.
        </p>
        <button
          type='button'
          data-clubs-opener
          mix={[ctaStyles, on('click', (event) => onChoose(event.currentTarget))]}
        >
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2.6'
            stroke-linecap='round'
            aria-hidden='true'
          >
            <path d='M12 5v14M5 12h14' />
          </svg>
          Choose clubs
        </button>
      </article>
    );
  };
}

const cardStyles = css({
  '@keyframes stack-card-in': {
    from: { opacity: 0, transform: `translateY(${space(12)})` },
  },

  position: 'relative',
  flex: '1',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space(2.5),
  margin: `0 ${space(2.5)}`,
  padding: `${space(6)} ${space(7)} ${space(7)}`,
  overflow: 'hidden',
  borderRadius: v('--radius-xl'),
  textAlign: 'center',
  background: `linear-gradient(170deg, ${v('--color-surface-raised')} 0rem, ${v('--color-surface')} 16.25rem, ${v('--color-bg')} 100%)`,
  boxShadow: v('--shadow-stack'),
  animation: `stack-card-in 640ms ${v('--ease-out')} 120ms backwards`,

  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: `repeating-linear-gradient(90deg, color-mix(in oklab, ${v('--color-white')} 2.5%, transparent) 0 1px, transparent 1px ${space(2.75)})`,
    pointerEvents: 'none',
  },
});

const fanStyles = css({
  position: 'relative',
  width: '100%',
  height: space(28),
  marginBottom: space(3.5),
});

const miniCardStyles = css({
  '@keyframes stack-fan-in': {
    from: { opacity: 0, transform: `translateY(${space(9)}) rotate(0deg)` },
  },

  position: 'absolute',
  left: '50%',
  top: space(2),
  display: 'flex',
  flexDirection: 'column',
  gap: space(1.5),
  width: space(29),
  height: space(20),
  marginLeft: space(-14.5),
  padding: `${space(2.25)} ${space(2.5)}`,
  borderRadius: v('--radius-md'),
  color: v('--color-white'),
  background: `linear-gradient(
    160deg,
    color-mix(in oklab, var(--club) 82%, var(--color-white)) 0%,
    var(--club) 55%,
    color-mix(in oklab, var(--club) 72%, var(--color-black)) 100%
  )`,
  boxShadow: `${v('--shadow-highlight')}, ${v('--shadow-card')}`,
  transform: `translate(calc(var(--k) * ${space(15.5)}), calc(var(--k) * var(--k) * ${space(2.5)})) rotate(calc(var(--k) * 9deg))`,
  animation: `stack-fan-in 720ms ${v('--ease-out')} backwards`,
  animationDelay: 'calc(280ms + (var(--k) + 1) * 70ms)',

  '& i': {
    height: space(1.5),
    borderRadius: v('--radius-full'),
    background: 'color-mix(in oklab, currentColor 38%, transparent)',
  },

  '& i:last-child': {
    width: '55%',
    opacity: 0.6,
  },
});

const titleStyles = css({
  position: 'relative',
  fontSize: v('--text-xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
  lineHeight: v('--leading-tight'),
});

const bodyStyles = css({
  position: 'relative',
  maxWidth: space(70),
  fontSize: v('--text-sm'),
  lineHeight: 1.4,
  color: v('--color-text-secondary'),
});

const ctaStyles = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  height: space(12.5),
  marginTop: space(3),
  padding: `0 ${space(6)} 0 ${space(5)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-base'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-accent-ink'),
  background: v('--color-accent'),
  boxShadow: v('--shadow-accent-glow'),
  transition: `transform 140ms ${v('--ease-out')}`,

  '&:active': {
    transform: 'scale(0.96)',
  },

  '& svg': {
    width: space(4.5),
    height: space(4.5),
  },
});
