# Match lineups: verification

Evidence for the PR that adds lineups to the match sheet, captured on branch `t3/match-lineups` at 07ecea5 (on top of main cce4a41).

- `verify.mjs` is the Playwright script. It runs Chromium with real touch input (CDP touch events) and WebKit with the mouse, against the app on port 44200. The app used the real football-data API (free-tier key) and FotMob, on a throwaway database.
- `verification.json` and `verify-output.txt` hold the results: 168/168 pass. They cover:
  - the phone flow on Barça 1–2 Real Madrid: swipe, vertical scroll on the pitch, rubber band, player card, jumping to a goal, closing the card, the bench card, and Escape;
  - layout checks for Barça's last five results at four sizes (Duo cover 382×618, phone 402×874, Duo inner 669×902, landscape 951×620): one half or side by side, no name tags colliding, nobody off the pitch, nothing spilling out of its half, no console errors.
- `test-full.txt` is the `bun run test` log (231/231 pass). `typecheck.txt` is the `tsc --noEmit` log (exit 0).
- Stills are WebKit at 2x. `phone-flow.gif` is Chromium with real touch.
