import { css } from 'remix/component';

export const tokens = {
  '--color-black': 'oklch(0% 0 0)',
  '--color-white': 'oklch(100% 0 0)',
  '--color-bg': 'oklch(14.9% 0.003 248.1)',
  '--color-surface': 'oklch(20.3% 0.005 248.1)',
  '--color-surface-raised': 'oklch(24.6% 0.007 248.1)',
  '--color-text': 'oklch(96.7% 0.002 247.8)',
  '--color-text-secondary': 'oklch(94.3% 0.013 286.1 / 0.6)',
  '--color-text-tertiary': 'oklch(94.3% 0.013 286.1 / 0.28)',
  '--color-separator': 'oklch(100% 0 0 / 0.08)',
  '--color-crest-plate': 'oklch(100% 0 0 / 0.94)',
  '--color-grabber': 'oklch(100% 0 0 / 0.45)',
  '--color-accent': 'oklch(91.1% 0.197 124.6)',
  '--color-accent-ink': 'var(--color-bg)',
  '--color-win': 'oklch(68.7% 0.18 150.1)',
  '--color-draw': 'oklch(71.4% 0.019 261.3)',
  '--color-loss': 'oklch(62.6% 0.193 23)',
  '--color-warning': 'oklch(78.2% 0.158 72.3)',

  '--font-mono':
    "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  '--text-2xs': '0.6875rem',
  '--text-xs': '0.8125rem',
  '--text-sm': '0.875rem',
  '--text-base': '1rem',
  '--text-xl': '1.375rem',
  '--text-2xl': '1.875rem',
  '--font-weight-medium': '500',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',
  '--font-weight-extrabold': '800',
  '--font-weight-black': '900',
  '--tracking-tighter': '-0.03em',
  '--tracking-tight': '-0.02em',
  '--leading-none': '1',
  '--leading-tight': '1.1',

  '--spacing': '0.25rem',
  '--gutter': 'calc(var(--spacing) * 5)',
  '--radius-md': '0.875rem',
  '--radius-lg': '1.125rem',
  '--radius-xl': '1.375rem',
  '--radius-full': 'calc(infinity * 1px)',

  '--shadow-sheet': '0 -0.625rem 2.5rem oklch(0% 0 0 / 0.5)',
  '--shadow-highlight': 'inset 0 1px 0 oklch(100% 0 0 / 0.2)',
  '--shadow-card': '0 0.75rem 1.5rem oklch(0% 0 0 / 0.35)',
  '--shadow-crest':
    '0 0 0 0.5px oklch(0% 0 0 / 0.12), 0 0.25rem 0.75rem oklch(0% 0 0 / 0.2)',
  '--shadow-stack':
    'inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 -0.3125rem 0 -0.125rem var(--color-surface-raised), 0 -0.625rem 0 -0.25rem var(--color-surface)',
  '--shadow-accent-glow':
    '0 0.5rem 1.5rem color-mix(in oklab, var(--color-accent) 22%, transparent)',
  '--shadow-badge':
    'inset 0 0 0 1px oklch(100% 0 0 / 0.25), 0 0.25rem 0.75rem oklch(0% 0 0 / 0.3)',

  '--ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
  '--ease-ios': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--duration-press': '120ms',
  '--duration-sheet-open': '480ms',
  '--duration-sheet-close': '340ms',

  '--safe-area-inset-top': 'env(safe-area-inset-top, 0px)',
  '--safe-area-inset-right': 'env(safe-area-inset-right, 0px)',
  '--safe-area-inset-bottom': 'env(safe-area-inset-bottom, 0px)',
  '--safe-area-inset-left': 'env(safe-area-inset-left, 0px)',
} as const satisfies Record<`--${string}`, string>;

export type Token = keyof typeof tokens;

export function v(token: Token): string {
  return `var(${token})`;
}

export function space(n: number): string {
  return `calc(var(--spacing) * ${n})`;
}

export const hideScrollbar = css({
  scrollbarWidth: 'none',

  '&::-webkit-scrollbar': {
    display: 'none',
  },
});
