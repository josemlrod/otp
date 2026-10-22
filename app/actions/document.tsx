import type { Handle, RemixNode } from 'remix/component';
import { css } from 'remix/component';
import { ImportMap } from 'remix/component/server';

import { scriptEntry } from '../assets.ts';
import { tokens, v } from '../ui/theme.ts';

export interface DocumentProps {
  children?: RemixNode;
  head?: RemixNode;
  title?: string;
}

const DEFAULT_TITLE = readAppDisplayName('Otp');

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = DEFAULT_TITLE } = handle.props;
    let { href, importMap, preloads } = scriptEntry;

    return (
      <html lang='en' mix={rootStyles}>
        <head>
          <meta charSet='utf-8' />
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1, viewport-fit=cover'
          />
          <meta name='color-scheme' content='dark' />
          <meta name='theme-color' content='#0a0b0c' />
          <meta name='mobile-web-app-capable' content='yes' />
          <meta name='apple-mobile-web-app-capable' content='yes' />
          <meta name='apple-mobile-web-app-title' content='OTP' />
          <link rel='icon' type='image/svg+xml' href='/favicon.svg' />
          <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
          <link rel='manifest' href='/manifest.webmanifest' />
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
  ...tokens,
  colorScheme: 'dark',

  fontFamily: v('--font-mono'),
  fontSize: v('--text-base'),
  color: v('--color-text'),
  background: v('--color-bg'),
  WebkitFontSmoothing: 'antialiased',
  WebkitTextSizeAdjust: '100%',
  WebkitTapHighlightColor: 'transparent',

  height: '100dvh',

  '& body': {
    height: '100%',
  },

  '&, & body': {
    margin: 0,
    overscrollBehavior: 'none',
  },

  ':where(&), :where(&) *, :where(&) ::before, :where(&) ::after': {
    boxSizing: 'border-box',
  },

  ':where(&) :where(h1, h2, h3, h4, p, ol, ul)': {
    margin: 0,
    padding: 0,
  },

  ':where(&) :where(button)': {
    font: 'inherit',
    color: 'inherit',
    background: 'none',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },

  ':where(&) :where(img, svg)': {
    display: 'block',
  },

  '@media (prefers-reduced-motion: reduce)': {
    ':where(&) *, :where(&) ::before, :where(&) ::after': {
      transition: 'none !important',
      animation: 'none !important',
    },
  },
});
