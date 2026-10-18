import { createController } from 'remix/router';

import { assets } from '../assets.ts';
import { routes } from '../routes.ts';
import { HomePage } from './home-page.tsx';
import { footballDataRepository } from '../lib/football-data-repository.ts';
import { tryCatch } from '../lib/utils.ts';

export default createController(routes, {
  actions: {
    async assets(context) {
      return (
        (await assets.fetch(context.request)) ??
        new Response('Not Found', { status: 404 })
      );
    },
    async home(context) {
      const COMPETITION_ID = 2021;
      const [res, err] = await tryCatch(
        footballDataRepository.fetchStandings(COMPETITION_ID),
      );

      console.log('res', res);
      console.log('err', err);

      return context.render(<HomePage standings={[res?.data]} />);
    },
  },
});
