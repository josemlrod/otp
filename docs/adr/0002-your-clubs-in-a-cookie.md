# Your clubs lives in a cookie, with no accounts

V1 has no accounts. Your clubs is stored in the browser as an ordered list of football-data club ids in the `otp_follows` cookie (ids joined with `.`, 400-day max age, `SameSite=Lax`), and the client writes it when the club picker closes. We use a cookie rather than localStorage, which the prototype used, so the server can render the right home screen on first paint, with the club cards instead of a flash of the empty state, and without building sign-in.

## Consequences

- Your clubs is per browser. Clearing cookies or switching devices loses it.
- The cookie keeps the name `otp_follows` even though the domain term is Your clubs. Renaming it would wipe every existing user's clubs.
- The server must treat the cookie as untrusted input and drop ids that aren't tracked clubs.
