# football-data.org behind a read-through SQLite cache

football-data.org (v4) is OTP's only source of standings and matches. Every call goes through a read-through cache in SQLite (the `api_cache` table, one row per request, on the Fly volume at `/data`) with a one-hour max age. When a fetch fails, the stale cached copy is served. A competition that has no copy at all is left off the page instead of failing it. We chose this because of the free tier's rate limit (10 requests a minute): one home render fans out to six standings calls plus one matches call per club in Your clubs. The cache lives in SQLite rather than memory because Fly machines auto-stop, and an in-memory cache would be cold on every wake.

## Consequences

- Data can be up to an hour old, and older during an outage. Live scores would mean revisiting this decision.
- The browser's freshness rule for club matches has to agree with the server's max age.
- Club and competition ids throughout the app (including the `otp_follows` cookie, see ADR-0002) are football-data ids. Changing the data source means mapping ids.
