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

**Next match**:
A club's soonest fixture.

**Venue**:
Whether the club plays at home (H) or away (A) in a match.

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

**Sheet**:
A panel that rises over the home screen while the screen behind it recedes.
_Avoid_: modal, drawer, dialog (except for its ARIA role)

## Relationships

- A **Tracked competition** has one **Standings**, and the **Standings** list many **Clubs**
- A **Club** belongs to exactly one **Club section**: the first **League** it appears in, otherwise **Rest of Europe**
- **Your clubs** holds zero or more **Tracked clubs** in the user's order; ids that aren't tracked clubs are dropped
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
- "Favourite" (the first four clubs stay on top) came from the Fold direction and has been **retired**. The Fade list gives no special treatment beyond opening the first club.
- "team" vs "club": resolved as **Club**. `TeamCard` (`app/lib/team-card.ts`), the server's cut-down form and fixtures for one club, still needs a club-based name. It is not the **Club card**, which is the UI that draws it.
- "known" clubs in code mean **Tracked clubs**.
