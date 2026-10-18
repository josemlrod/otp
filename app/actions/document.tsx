import type { Handle, RemixNode } from 'remix/component';
import { css } from 'remix/component';
import { ImportMap } from 'remix/component/server';

import { scriptEntry } from '../assets.ts';

export interface DocumentProps {
  children?: RemixNode;
  head?: RemixNode;
  title?: string;
}

const FONT_STACK =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const DEFAULT_TITLE = readAppDisplayName('Otp');

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = DEFAULT_TITLE } = handle.props;
    let { href, importMap, preloads } = scriptEntry;

    return (
      <html lang='en' mix={rootStyles}>
        <head>
          <meta charSet='utf-8' />
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <meta name='color-scheme' content='light dark' />
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1, viewport-fit=cover'
          />
          <link rel='icon' type='image/svg+xml' href='/favicon.svg' />
          <title>{title}</title>
          {head}
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel='modulepreload' href={preloadHref} />
          ))}
          <script type='module' src={href}></script>
        </head>
        <body>{children}</body>
      </html>
    );
  };
}

function readAppDisplayName(value: string): string {
  return value.startsWith('%%') ? 'Remix App' : decodeURIComponent(value);
}

const rootStyles = css({
  '--font': FONT_STACK,
  '--ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
  '--ease-ios': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--win': '#1fb85a',
  '--draw': '#9ca3af',
  '--loss': '#e5484d',
  '--text': '#f3f4f5',
  '--text-secondary': 'rgba(235, 235, 245, 0.6)',
  '--text-tertiary': 'rgba(235, 235, 245, 0.28)',

  '--bg': '#0a0b0c',
  '--surface': '#151719',
  '--surface-2': '#1e2124',
  '--text-2': 'rgba(235, 235, 245, 0.6)',
  '--text-3': 'rgba(235, 235, 245, 0.28)',
  '--sep': 'rgba(255, 255, 255, 0.08)',
  '--accent': '#c5f74f',
  '--accent-ink': '#0a0b0c',
  '--hl': 'rgba(197, 247, 79, 0.09)',
  '--press': 'rgba(255, 255, 255, 0.06)',
  '--bar': 'rgba(16, 17, 19, 0.8)',
  'color-scheme': 'dark',

  '--safe-area-inset-top': '0px',
  '--safe-area-inset-right': '0px',
  '--safe-area-inset-bottom': '0px',
  '--safe-area-inset-left': '0px',

  '@supports (padding: env(safe-area-inset-top))': {
    '--safe-area-inset-top': 'env(safe-area-inset-top, 0px)',
    '--safe-area-inset-right': 'env(safe-area-inset-right, 0px)',
    '--safe-area-inset-bottom': 'env(safe-area-inset-bottom, 0px)',
    '--safe-area-inset-left': 'env(safe-area-inset-left, 0px)',
  },

  '&, & *, &::before, &::after, & *::before, & *::after': {
    boxSizing: 'border-box',
  },

  '&, & body': {
    margin: 0,
    height: '100%',
  },

  '& h1, & h2, & h3, & p, & ol, & ul': {
    margin: 0,
    padding: 0,
  },

  fontFamily: 'var(--font)',

  paddingTop: 'var(--safe-area-inset-top, 0px)',
  paddingBottom: 'var(--safe-area-inset-bottom, 0px)',
  border: '1px solid red',
});
