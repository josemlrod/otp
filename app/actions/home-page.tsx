import type { Handle } from 'remix/component';
import { css } from 'remix/component';

import { Document } from './document.tsx';

import type { StandingsResponse } from '../lib/types/api.ts';
import { Standings } from './public/standings/index.tsx';
import { Logo } from '../ui/logo.tsx';

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

export function HomePage(handle: Handle<{ standings: StandingsResponse[] }>) {
  const { standings } = handle.props;

  return () => (
    <Document>
      <main
        mix={css({
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        })}
      >
        <header mix={css({ padding: '14px 22px 0 22px' })}>
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
          <p mix={[subtitleStyles]}>Competitions</p>

          <Standings standings={standings} />
        </section>

        <section></section>
      </main>
    </Document>
  );
}
