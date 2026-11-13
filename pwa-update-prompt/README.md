# Proof: update prompt

Branch commit: `ecbc1cd20b79705f2c0e2fe4ba07cbe1c7ceecd6`

`verify.mjs` starts the app on port 44321 (`NODE_ENV=test OTP_SCENARIO=matchday`, minified assets) with `APP_VERSION=v1` and loads it at 393×852. It then restarts the server with `APP_VERSION=v2` to stand in for a deploy, dispatches `visibilitychange` (what reopening the installed app fires) and taps Later, then Update. It runs in WebKit and in Chromium.

- `verify-output.txt`: 25/25 checks pass
- `verification.json`: cache headers and the per-browser results
- `test-full.txt`: 209/209 pass. `typecheck.txt`: clean
- `webkit-1-v1.png`, `webkit-2-prompt.png`, `webkit-3-v2.png`: WebKit at 2x
- `update.gif`: the Chromium run at 2.5× speed
