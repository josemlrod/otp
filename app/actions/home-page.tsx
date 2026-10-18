import type { Handle } from 'remix/component';

import { Document } from './document.tsx';
import { HomeScreen } from './public/home-screen.tsx';

import type { StandingsResponse } from '../lib/types/api.ts';

export function HomePage(handle: Handle<{ standings: StandingsResponse[] }>) {
  return () => (
    <Document>
      <HomeScreen standings={handle.props.standings} />
    </Document>
  );
}
