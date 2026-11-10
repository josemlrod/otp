import type { Handle } from 'remix/component';

import type { Clock } from '../lib/clock.ts';

import { Document } from './document.tsx';
import { HomeScreen } from './public/home-screen.tsx';

import type { ClubSection } from '../lib/clubs.ts';
import type { YourClubs } from '../lib/your-clubs.ts';
import type { TeamCard } from '../lib/team-card.ts';
import type { StandingsResponse } from '../lib/types/api.ts';

type Props = {
  clock: Clock;
  standings: StandingsResponse[];
  sections: ClubSection[];
  yourClubs: YourClubs;
  initialMatches: TeamCard[];
};

export function HomePage(handle: Handle<Props>) {
  return () => (
    <Document>
      <HomeScreen
        clock={handle.props.clock}
        standings={handle.props.standings}
        sections={handle.props.sections}
        yourClubs={handle.props.yourClubs}
        initialMatches={handle.props.initialMatches}
      />
    </Document>
  );
}
