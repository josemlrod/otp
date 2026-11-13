import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  clubMatches: get('/api/clubs/:clubId/matches'),
  matchReport: get('/api/clubs/:clubId/matches/:matchId'),
  version: get('/api/version'),
  home: '/',
});
