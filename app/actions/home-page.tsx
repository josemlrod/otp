import type { Handle } from 'remix/component';

import { Document } from './document.tsx';
import { HomeScreen } from './public/home-screen.tsx';

import type { TeamCard } from '../lib/team-card.ts';
import type { StandingsResponse } from '../lib/types/api.ts';

type Props = {
  standings: StandingsResponse[];
  follows: number[];
  initialMatches: TeamCard[];
};

export function HomePage(handle: Handle<Props>) {
  return () => (
    <Document>
      <HomeScreen
        standings={handle.props.standings}
        follows={handle.props.follows}
        initialMatches={handle.props.initialMatches}
      />
    </Document>
  );
}
