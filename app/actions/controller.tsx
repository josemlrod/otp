import { createController } from 'remix/router';

import { assets } from '../assets.ts';
import { routes } from '../routes.ts';
import { HomePage } from './home-page.tsx';
import { footballDataRepository } from '../lib/football-data-repository.ts';

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

      return context.render(<HomePage standings={standings} />);
    },
  },
});
