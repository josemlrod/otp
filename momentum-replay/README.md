# Momentum replay: verification

This is the evidence for the PR that draws FotMob momentum on the match replay. It was captured on branch `t3/momentum-replay` at 4444f87, on top of main f4f3ee1.

- `verify.mjs` is the Playwright script. It runs in Chromium and WebKit with real mouse and keyboard input.
- `verification.json` and `verify-output.txt` hold the results: 84/84 pass.
- `test-full.txt` is the `bun run test` log (202/202 pass). `typecheck.txt` is the `tsc --noEmit` log (exit 0).
- Screenshots are WebKit at 2x. `scrub.gif` is Chromium.

The script checks "Time on top" against its own reading of FotMob's raw minutes. That reading is written separately from `match-replay.ts`.

Servers:
- 44491: this branch against the real football-data API (free-tier key) and FotMob, on a throwaway database.
- 44492: `main` with the same key and sources. This is the "before".
- 44493: this branch with `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T12:00:00Z OTP_TZ=Europe/London`.
- 44494: `main` with the same scenario, used for pixel parity. Scenarios have no momentum, so the sheet must not change.

Matches: Man United 4–4 Aston Villa (PL, 8 Nov, 4' + 6' added) and Liverpool 4–3 Villarreal (CL, 20 Oct, 1' + 3' added).
