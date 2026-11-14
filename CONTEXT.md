# On the Pitch

A mobile-first app for following your soccer clubs across the big European leagues and the Champions League: their form, their next match, and where they sit in the standings, all on one screen.

## Language

### Competitions

**Competition**:
A league or cup whose standings and matches OTP shows.
_Avoid_: tournament

**Tracked competition**:
One of the fixed set of competitions OTP fetches: PL, BL1, SA, PD, FL1 and CL.
_Avoid_: supported league

**League**:
A domestic competition (the API's `LEAGUE` type), as opposed to the Champions League.

**Standings**:
A competition's table of position, points and goal difference for each club, possibly split into groups.
_Avoid_: rankings, league table (in code)

### Clubs

**Club**:
A football team as OTP shows it, identified by its football-data id.
_Avoid_: team (except inside the football-data adapter, where the API says team)

**Tracked club**:
A club that appears in the standings of a tracked competition. Only tracked clubs can be followed.
_Avoid_: known club, supported team

**Club section**:
The group a club is listed under when picking clubs: its league, or **Rest of Europe** for clubs that only appear in the Champions League.

**Position**:
A club's place in the standings of its club section's competition.

**Your clubs**:
The ordered list of clubs the user follows. The first one opens as the full club card.
_Avoid_: follows, favourites, stack

**Follow** / **Unfollow**:
Adding a club to, or removing it from, Your clubs.

### Matches

**Match**:
One game between two clubs in a competition.
_Avoid_: game

**Result**:
A finished match seen from one club's side: outcome (W/D/L), score and venue.
_Avoid_: played match

**Form**:
A club's last five results, oldest first.
_Avoid_: streak, recent results

**Fixture**:
A match that hasn't been played yet (scheduled or timed).
_Avoid_: upcoming match, next game

**ClubMatches**:
The server projection of one club's form and fixtures, with its club id and fetch time.
_Avoid_: TeamCard

**Next match**:
A club's soonest fixture.

**Venue**:
Whether the club plays at home (H) or away (A) in a match.

**Match report**:
The server projection of one finished match. The base is football-data's `/v4/matches/{id}` (the score, plus whatever the API plan adds). FotMob, when it has the match, fills in minute-stamped goals with assists, cards and substitutions, full-time statistics with xG, lineups, momentum and the player of the match (ADR-0005).
_Avoid_: match details, match data

**Momentum**:
FotMob's minute-by-minute measure of which side was on top: above zero the home side, below zero the away side.
_Avoid_: pressure, attack momentum

**Time on top**:
The minutes a side had momentum in its favour, up to a point in the match. Compare **time in front**, the minutes a side led on the score.

**Lineup**:
One side's formation, coach, starters and substitutes for a match, each player with a shirt number, rating and what they did (goals, assists, a card, coming on or going off).

**Replay**:
A match report's events laid out on the match clock, so the match sheet can show the score, time in front and moments at any minute.

### Home screen

**Club card**:
The full card for one of Your clubs: crest, name, position, form and the timeline.

**Club row**:
The one-line version of a club card that every club except the open one collapses to.

**Timeline**:
The club card's linked strip and pager: one pill per result plus a Next slot, with a page for each result and each fixture. Strip and pager always show the same position.

**Picked result**:
The result the timeline is resting on after a scrub or swipe. It stays picked until the user scrubs or swipes back to the Next slot.

**Club picker**:
The sheet where the user edits Your clubs.

**Standings sheet**:
The sheet that shows one competition's standings.

**Match sheet**:
The sheet that shows one result in full, opened from a picked result on the club card or a Last 5 row on the club page. Its strip scrubs the replay and docks under the top edge once scrolled past. Below it, the lineups put each side's starting XI on their own half of the pitch with the bench underneath: one side at a time on a phone (swipe or the switch), side by side on a wide sheet.

**Player card**:
The small card that opens from a player in the lineups: rating, minutes and what they did, each event a jump in the replay. Where a player page will hang from.
_Avoid_: popover, tooltip, peek (in UI copy)

**Sheet**:
A panel that rises over the home screen while the screen behind it recedes.
_Avoid_: modal, drawer, dialog (except for its ARIA role)

### Wide layout

**Wide layout**:
The home screen on a display at least 600px wide and 500px tall, such as an unfolded iPhone Duo or an iPad: a **Sidebar** beside a **Detail pane**. Phones (on their side too), the Duo's cover display and Split View keep the phone layout, as does any display before a club is followed.
_Avoid_: tablet mode, desktop layout

**Sidebar**:
The wide layout's list of Your clubs and the tracked competitions. At rest it's the **Rail**, crests only; dragged out, it floats over the detail pane at whatever width it's left, showing names, a detail line and form as it widens.
_Avoid_: drawer, menu

**Detail pane**:
The part of the wide layout that shows the **Club page** or **Competition page** picked in the sidebar. Its blocks flow into one, two or three columns with the width.

**Club page**:
A club in the detail pane: its next match with both clubs' standings side by side, the fixtures after it, the last five results, the season so far and its corner of each table. It replaces the club card's **Timeline**, which stays phone-only.

**Competition page**:
A competition in the detail pane: the full standings beside Your clubs in it.

## Relationships

- A **Tracked competition** has one **Standings**, and the **Standings** list many **Clubs**
- A **Club** belongs to exactly one **Club section**: the first **League** it appears in, otherwise **Rest of Europe**
- **Your clubs** holds zero or more **Tracked clubs** in the user's order. A saved id is dropped only once every **Tracked competition**'s standings have loaded and it isn't among them; until then it is kept, even though it can't be shown
- A **Club card** shows one **Club**'s **Form** (up to five **Results**) and up to four **Fixtures**
- The **Timeline** has one slot per **Result** plus a Next slot, and one page per **Result** and per **Fixture**
- Changes in the **Club picker** are saved to **Your clubs** when the sheet closes, whichever way it closes

## Example dialogue

> **Dev:** "When someone follows a club that only plays in the Champions League, where does it go?"
> **Domain expert:** "It's still a **Tracked club**, because it's in the CL **Standings**. In the **Club picker** it sits under **Rest of Europe**, and its **Position** is its CL position."
>
> **Dev:** "And if they swipe the **Club picker** closed instead of tapping Done?"
> **Domain expert:** "Same thing. Closing is saving. **Your clubs** updates and the new club's card loads."
>
> **Dev:** "Once they scrub to a **Result**, does the card snap back to the **Next match**?"
> **Domain expert:** "No, it stays the **Picked result**. They scrub to the Next slot, or swipe the pager, to come back."

## Flagged ambiguities

- "follows", "favourites" and "stack" were all used for the clubs a user follows. Resolved: the concept is **Your clubs** and the verb is **follow**. "Build your stack" is empty-state copy only. The `otp_follows` cookie keeps its name (see ADR-0002).
- "Favourite" (the first four clubs stay on top) came from the Fold direction and has been **retired and removed from the code**. The Fade list gives no special treatment beyond opening the first club.
- "team" vs "club": resolved as **Club**. The server projection is **ClubMatches** (`app/lib/club-matches.ts`); the **Club card** is the UI that draws it.
- "known" vs "tracked" clubs: resolved as **Tracked clubs** in code.
