import { Cookie } from 'remix/headers';
import { createController } from 'remix/router';

import { assets } from '../assets.ts';
import { routes } from '../routes.ts';
import { HomePage } from './home-page.tsx';
import { footballDataRepository } from '../lib/football-data-repository.ts';
import { FOLLOWS_COOKIE, parseFollows } from '../lib/follows.ts';

export default createController(routes, {
  actions: {
    async assets(context) {
      return (
        (await assets.fetch(context.request)) ??
        new Response('Not Found', { status: 404 })
      );
    },
    async home(context) {
      const standings = await footballDataRepository.fetchAllStandings();
      const cookie = Cookie.from(context.request.headers.get('Cookie'));
      const follows = parseFollows(cookie.get(FOLLOWS_COOKIE));

      return context.render(<HomePage standings={standings} follows={follows} />);
    },
  },
});
