# FotMob match reports: verification

This is the evidence for the PR that fills in match reports from FotMob. It was captured on branch `t3/fotmob-match-reports` at 025c7bb, on top of main 1b67e2b.

- `verify.mjs` is the Playwright script. It runs in Chromium and WebKit with real mouse and keyboard input.
- `verification.json` and `verify-output.txt` hold the results: 68/68 pass.
- `coverage.py` and `real-api-coverage.txt` cover every recent result of seven followed clubs, run through the new code against the real APIs.
- `test-full.txt` is the `bun run test` log (193/193 pass). `typecheck.txt` is the `tsc --noEmit` log (exit 0).
- Screenshots are WebKit at 2x. `scrub.gif` is Chromium.

Servers:
- 44391: this branch against the real football-data API (free-tier key) and FotMob, on a throwaway database.
- 44392: `main` against the real football-data API with the same key. This is the "before".
- 44393: this branch with `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T12:00:00Z OTP_TZ=Europe/London`.
- 44394: `main` with the same scenario, used for pixel parity.
