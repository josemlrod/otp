# The match sheet reads only what /v4/matches/{id} returns

_Partly superseded by ADR-0005: FotMob now fills in events, stats, lineups and momentum. The rate-limit guard below still holds._

The match sheet is built from football-data's `/v4/matches/{id}` and nothing else. The response's minute-stamped goals, bookings and substitutions drive the replay: the score at any minute, who was ahead and for how long, and the key moments. Its `statistics` are full-time totals, shown as totals, never rewound. We prototyped a momentum strip and per-minute stats. They would have needed shot data the API doesn't have, or our own server polling every live match once a minute and storing snapshots, so we left them out until there is a data source that has them.

Only one of a tracked club's last five results can be requested (`/api/clubs/:clubId/matches/:matchId`), so the route can't be used to spend the rate limit on arbitrary match ids. Responses go through the same read-through cache as everything else (ADR-0001).

## Consequences

- Which fields arrive depends on the plan. On the free tier the response carries the score and referees only: the sheet shows the score, half time and date, and says moments aren't available. Deep Data adds the events, and so the replay. The statistics and odds add-ons add the totals and the pre-match chances.
- First-half added time is only known from events stamped in it, so the strip's first half can be a minute or two short. Bookings and substitutions are stamped with a minute only.
- A richer source later (shots, per-minute stats) would add to `MatchReport` and `replayOf` rather than replace them.
