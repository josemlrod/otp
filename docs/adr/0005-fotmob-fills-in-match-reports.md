# FotMob fills in match reports

football-data's free tier gives a finished match's score and referees and nothing else, so the match sheet had no moments to replay. Its Deep Data plan (€29 a month) adds events but still has no lineups, ratings or momentum. FotMob's site is backed by a JSON API that has all of it: goals with assists, cards, substitutions, full-time stats with xG, lineups with ratings, the player of the match, and minute-by-minute momentum. We now read finished matches from it, behind the football-data report: football-data still owns the clubs, ids, form and score, and FotMob only adds to the report (`app/lib/fotmob.ts`, `withFotMob`).

FotMob has its own match ids, so the match is looked up in FotMob's list for its kickoff day (`/api/data/matches?date=`). It has to be in the same league and kick off within a few hours of the football-data kickoff, and both clubs' names have to overlap, ignoring accents and words like "FC". Then its details are fetched (`/api/data/matchDetails?matchId=`). Both requests go through the same read-through cache as football-data (ADR-0001), under `fotmob-day-*` and `fotmob-match-*` keys. A match the sheet has opened costs at most one list and one details request an hour.

We chose FotMob over ESPN's open API, which has events, lineups and stats but no ratings or momentum. Sofascore was ruled out because it rejects requests from servers.

## Consequences

- **FotMob's terms forbid scraping and reuse without written consent.** That's acceptable while OTP is a personal app. Before OTP is offered to anyone else, this needs a licence or a paid provider.
- The API is undocumented and can change or start refusing requests without warning. Every field is optional in our types, a failure anywhere leaves the football-data report as it was, and the sheet degrades the same way it does on the free tier.
- Scenarios (`OTP_SCENARIO`) never call FotMob. They keep exercising the Deep Data fixtures.
- Momentum minutes squeeze added time into fractions (45.5, 90.75), not real minutes. `swingsOf` in `match-replay.ts` spreads them evenly across the added time `replayOf` lays out, the last one landing on the whistle. When a report has momentum, the replay strip draws it instead of the lead bands, and the stats card adds a "Time on top" row that rewinds with the strip.
- The few text fields FotMob sends (e.g. "assist by …") are requested in English. The assist name is read from the lineup by player id where possible.
