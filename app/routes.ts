import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  teamMatches: get('/api/team/:teamId/matches'),
  home: '/',
});
