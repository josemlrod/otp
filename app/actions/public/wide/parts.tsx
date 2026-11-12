import { css } from 'remix/component';

import { space, v } from '../../../ui/theme.ts';

// Styles every wide page shares: block labels, card surfaces, list rows and the date cell.

export const labelStyles = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: space(2),
  padding: `0 ${space(1)}`,
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),
});

export const cardStyles = css({
  borderRadius: v('--radius-lg'),
  background: v('--card-fill'),
  boxShadow: v('--shadow-highlight'),
  overflow: 'hidden',
});

export const listStyles = css({
  listStyle: 'none',

  '& > li': {
    display: 'flex',
    alignItems: 'center',
    gap: space(3),
    height: space(15),
    padding: `0 ${space(4)}`,
  },

  '& > li + li': {
    boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,
  },

  // A narrow column gives the names room by dropping the opponent's crest.
  '@container (max-width: 18rem)': {
    '& > li > [data-club-crest]': {
      display: 'none',
    },
  },
});

export const dateCellStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 'none',
  width: space(13),
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),
  textTransform: 'uppercase',

  '& b': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    color: v('--color-text'),
    textTransform: 'none',
  },
});

export const infoStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1),
  minWidth: 0,
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),

  '& b': {
    overflow: 'hidden',
    fontSize: v('--text-sm'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: v('--color-text'),
  },
});

export const whenStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.5),
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});

export const resultColors = {
  '&[data-r="W"]': { color: v('--color-win') },
  '&[data-r="D"]': { color: v('--color-draw') },
  '&[data-r="L"]': { color: v('--color-loss') },
} as const;

export const formDotsStyles = css({
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
});

export const Chevron = () => () => (
  <svg
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    stroke-width='2.6'
    stroke-linecap='round'
    stroke-linejoin='round'
    aria-hidden='true'
  >
    <path d='m9 6 6 6-6 6' />
  </svg>
);
