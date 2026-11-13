import { createRouter, type MiddlewareContext } from 'remix/router';
import { render } from 'remix/middleware/render';
import { staticFiles } from 'remix/middleware/static';

import { createAppController } from './actions/controller.tsx';
import type { FootballData } from './lib/football-data.ts';
import { assets } from './assets.ts';
import { routes } from './routes.ts';

const renderMiddleware = render({ assets });
type AppContext = MiddlewareContext<[typeof renderMiddleware]>;

declare module 'remix' {
  interface RouterTypes {
    context: AppContext;
  }
}

export function createAppRouter(dependencies: Parameters<typeof createAppController>[0]) {
  const router = createRouter<AppContext>({
    // Revalidate on every load, so a deploy's manifest and icons reach installed apps.
    middleware: [staticFiles('./public', { index: false, cacheControl: 'no-cache' }), renderMiddleware],
  });

  router.map(routes, createAppController(dependencies));
  return router;
}
