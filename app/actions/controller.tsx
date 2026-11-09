import { Cookie } from 'remix/headers';
import { createController } from 'remix/router';

import { assets } from '../assets.ts';
import { routes } from '../routes.ts';
import { HomePage } from './home-page.tsx';
import type { FootballData } from '../lib/football-data.ts';
import { resolveYourClubs } from '../lib/your-clubs.ts';
import { FOLLOWS_COOKIE, parseFollows } from '../lib/follows.ts';

function parseClubId(param: string): number | null {
  const id = Number(param);
  return /^[0-9]+$/.test(param) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createAppController({ footballData }: { footballData: FootballData }) {
  return createController(routes, {
    actions: {
      async assets(context) {
        return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
      },

      async teamMatches(context) {
        const teamId = parseClubId(context.params.teamId);
        if (teamId === null) {
          return new Response('Not Found', { status: 404 });
        }
        const result = await footballData.clubCard(teamId);
        if (result.status === 'not-tracked') return new Response('Not Found', { status: 404 });
        if (result.status === 'unavailable') return new Response('Bad Gateway', { status: 502 });
        return Response.json(result.card);
      },

      async home(context) {
        const cookie = Cookie.from(context.request.headers.get('Cookie'));
        const follows = parseFollows(cookie.get(FOLLOWS_COOKIE));

        const tracked = await footballData.trackedCompetitions();
        const yourClubs = resolveYourClubs(follows, tracked.sections, tracked.complete);
        const initialMatches = await footballData.clubCards(
          yourClubs.clubs.map((club) => club.id),
          tracked,
        );

        return context.render(
          <HomePage
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
