# Match sheet: verification

Evidence for the match sheet PR, captured on branch `t3/match-sheet` at cdaf9cb, rebased on main 5180936.

- `verify.mjs`: the Playwright script. Chromium and WebKit, real mouse, keyboard and wheel input.
- `verification.json` and `verify-output.txt`: results, 102/102. `verify-output-run1.txt` is an identical earlier run.
- `test-full.txt`: `bun run test`, 178/178. `typecheck.txt`: `tsc --noEmit`, exit 0.
- `real-api.txt`: the new endpoint against the real football-data API (free-tier key).
- Screenshots are WebKit at 2x; `scrub.gif` is Chromium.

Servers:
- 44121: this branch, `OTP_SCENARIO=matchday OTP_NOW=2026-11-08T12:00:00Z OTP_TZ=Europe/London`
- 44122: `main`, same scenario (pixel parity)
- 44123: this branch against the real API with a throwaway database
