import { Cookie } from 'remix/headers';
import { createController } from 'remix/router';

import { assets } from '../assets.ts';
import { routes } from '../routes.ts';
import { HomePage } from './home-page.tsx';
import type { FootballData } from '../lib/football-data.ts';
import { resolveYourClubs } from '../lib/your-clubs.ts';
import {
  TIME_ZONE_COOKIE,
  timeZoneFromCookie,
  type Clock,
  type ClockSource,
} from '../lib/clock.ts';
import { YOUR_CLUBS_COOKIE, parseYourClubsCookie } from '../lib/your-clubs-cookie.ts';

// A positive integer id from a URL segment: a club or a match.
function parseId(param: string): number | null {
  const id = Number(param);
  return /^[0-9]+$/.test(param) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

const SYSTEM_CLOCK: ClockSource = { now: Date.now, pinned: false };

export function createAppController({
  footballData,
  clock: clockSource = SYSTEM_CLOCK,
}: {
  footballData: FootballData;
  clock?: ClockSource;
}) {
  return createController(routes, {
    actions: {
      async assets(context) {
        return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
      },

      async clubMatches(context) {
        const clubId = parseId(context.params.clubId);
        if (clubId === null) {
          return new Response('Not Found', { status: 404 });
        }
        const result = await footballData.clubMatches(clubId);
        if (result.status === 'not-tracked') return new Response('Not Found', { status: 404 });
        if (result.status === 'unavailable') return new Response('Bad Gateway', { status: 502 });
        return Response.json(result.matches);
      },

      async matchReport(context) {
        const clubId = parseId(context.params.clubId);
        const matchId = parseId(context.params.matchId);
        if (clubId === null || matchId === null) return new Response('Not Found', { status: 404 });
        const result = await footballData.matchReport(clubId, matchId);
        if (result.status === 'not-found') return new Response('Not Found', { status: 404 });
        if (result.status === 'unavailable') return new Response('Bad Gateway', { status: 502 });
        return Response.json(result.report);
      },

      async home(context) {
        const cookie = Cookie.from(context.request.headers.get('Cookie'));
        const savedIds = parseYourClubsCookie(cookie.get(YOUR_CLUBS_COOKIE));

        const tracked = await footballData.trackedCompetitions();
        const yourClubs = resolveYourClubs(savedIds, tracked.sections, tracked.complete);
        const initialMatches = await footballData.matchesForClubs(
          yourClubs.clubs.map((club) => club.id),
          tracked,
        );

        const clock: Clock = {
          now: clockSource.now(),
          timeZone: clockSource.timeZone ?? timeZoneFromCookie(cookie.get(TIME_ZONE_COOKIE)),
          pinned: clockSource.pinned,
          timeZonePinned: clockSource.timeZone !== undefined,
        };
        return context.render(
          <HomePage
            clock={clock}
            standings={tracked.standings}
            sections={tracked.sections}
            yourClubs={yourClubs}
            initialMatches={initialMatches}
          />,
        );
      },
    },
  });
}
