import { clientEntry, css, on, type Handle } from 'remix/component';

import { alignedNow, timeZoneCookie, type Clock } from '../../lib/clock.ts';
import { today } from '../../lib/match-format.ts';
import { leagueLeaders, type ClubSection } from '../../lib/clubs.ts';
import type { YourClubs } from '../../lib/your-clubs.ts';
import { YourClubsModel } from './clubs/your-clubs.ts';
import type { ClubMatches } from '../../lib/club-matches.ts';
import type { StandingsResponse } from '../../lib/types/api.ts';
import { Logo } from '../../ui/logo.tsx';
import { BuildYourStack } from './clubs/build-your-stack.tsx';
import { ClubList } from './clubs/club-list.tsx';
import { ClubPicker } from './clubs/club-picker.tsx';
import { Standings } from './standings/index.tsx';
import { StandingsSheet } from './standings/standings-sheet.tsx';
import { Sheet, SheetController } from './sheet.tsx';
import { countRender } from './perf/renders.ts';
import { space, v } from '../../ui/theme.ts';
import { MatchesModel } from './clubs/matches.ts';
import { MatchSheet } from './match/match-sheet.tsx';
import { MatchReportsModel } from './match/reports.ts';
import type { Club } from '../../lib/clubs.ts';
import type { PlayedMatch } from '../../lib/club-matches.ts';
import { WIDE_QUERY } from './wide/layout.ts';
import { WideHome } from './wide/wide-home.tsx';

const STACK_PREVIEW_CLUBS = 3;

type Props = {
  clock: Clock;
  standings: StandingsResponse[];
  sections: ClubSection[];
  yourClubs: YourClubs;
  initialMatches?: ClubMatches[];
  /** Media query for the wide layout. Tests pin a layout with it; the app uses WIDE_QUERY. */
  wideQuery?: string;
};

type Layout = 'pending' | 'phone' | 'wide';

export const HomeScreen = clientEntry(import.meta.url, function HomeScreen(handle: Handle<Props>) {
  const sections = handle.props.sections;
  const stackPreview = leagueLeaders(handle.props.standings, STACK_PREVIEW_CLUBS);
  const titleId = `${handle.id}-sheet-title`;
  let pickerSessions = 0;
  const sheet = new SheetController();

  // Hydrate with the server's clock so the first paint matches the HTML. Then measure time on
  // the server's clock (a wrong device clock can't skew freshness) and switch to local time.
  let clock = handle.props.clock;
  let now = () => clock.now;
  const matches = new MatchesModel(handle.props.initialMatches, { now: () => now() });
  const reports = new MatchReportsModel({ now: () => now() });
  handle.queueTask(() => {
    now = alignedNow(handle.props.clock, Date.now);
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.cookie = timeZoneCookie(localZone);
    if (clock.timeZonePinned || clock.timeZone === localZone) return;
    clock = { ...clock, now: now(), timeZone: localZone };
    handle.update();
  });
  const yourClubs = new YourClubsModel(handle.props.yourClubs, sections, {
    load: (id) => matches.load(id),
  });
  yourClubs.addEventListener('change', () => handle.update(), { signal: handle.signal });
  handle.queueTask(() => yourClubs.current.clubs.forEach((club) => matches.load(club.id)));

  // The server can't know the screen, so it always sends the phone layout ('pending'). Once
  // hydrated, a wide display switches to the wide layout. A phone keeps what the server sent
  // without re-rendering. Folding, unfolding or turning the device switches live.
  let layout: Layout = 'pending';
  handle.queueTask(() => {
    const media = matchMedia(handle.props.wideQuery ?? WIDE_QUERY);
    const apply = () => {
      const next: Layout = media.matches ? 'wide' : 'phone';
      if (next === layout) return;
      const wasPending = layout === 'pending';
      layout = next;
      if (wasPending && next === 'phone') return;
      handle.update();
    };
    apply();
    media.addEventListener('change', apply, { signal: handle.signal });
  });

  function showStandings(standing: StandingsResponse, button: HTMLButtonElement) {
    sheet.show({
      opener: button,
      labelledBy: titleId,
      content: () => (
        <StandingsSheet standing={standing} titleId={titleId} onClose={sheet.close} />
      ),
    });
  }

  function showMatch(club: Club, match: PlayedMatch, button: HTMLButtonElement) {
    sheet.show({
      opener: button,
      labelledBy: titleId,
      size: 'wide',
      content: () => (
        <MatchSheet
          key={match.id}
          club={club}
          match={match}
          reports={reports}
          clock={clock}
          titleId={titleId}
          onClose={sheet.close}
        />
      ),
    });
  }

  function chooseClubs(button: HTMLButtonElement) {
    yourClubs.beginEdit();
    const session = ++pickerSessions;
    const initial = yourClubs.current.clubs.map((club) => club.id);
    sheet.show({
      opener: button,
      labelledBy: titleId,
      onClose: () => yourClubs.commit(),
      content: () => (
        <ClubPicker
          key={session}
          sections={sections}
          initial={initial}
          titleId={titleId}
          onChange={(ids) => yourClubs.setDraft(ids)}
          onDone={sheet.close}
        />
      ),
    });
  }

  return () => {
    countRender('HomeScreen');
    const { clubs, unavailable } = yourClubs.current;
    // Wide displays use the wide layout once there's a club to show.
    const wide = layout === 'wide' && clubs.length > 0;
    const pending = layout === 'pending';
    return (
      <Sheet
        controller={sheet}
        focusFallback={(screen) => screen.querySelector('[data-clubs-opener]')}
      >
        {wide ? (
          <WideHome
            clubs={clubs}
            standings={handle.props.standings}
            matches={matches}
            clock={clock}
            onEdit={chooseClubs}
            onOpenMatch={showMatch}
          />
        ) : (
          <>
            <header mix={pending ? [headerStyles, pendingStyles] : headerStyles}>
              <p mix={subtitleStyles}>{today(clock)}</p>
              <div data-perf-toggle mix={brandStyles}>
                <Logo size={space(7.5)} />
                <h3 mix={titleStyles}>On the Pitch</h3>
              </div>
            </header>

            <section mix={pending ? [sectionStyles, pendingStyles] : sectionStyles}>
              <p mix={[subtitleStyles, insetStyles]}>Competitions</p>
              <Standings standings={handle.props.standings} onSelect={showStandings} />
            </section>

            <section
              mix={[
                clubsSectionStyles,
                clubs.length ? clubsListStyles : clubsEmptyStyles,
                ...(pending ? [pendingStyles] : []),
              ]}
            >
              <p mix={[subtitleStyles, insetStyles, clubsLabelStyles]}>
                {clubs.length ? `Your clubs · ${clubs.length}` : 'Your clubs'}
                {clubs.length > 0 && (
                  <button
                    type='button'
                    data-clubs-opener
                    mix={[editStyles, on('click', (event) => chooseClubs(event.currentTarget))]}
                  >
                    Edit
                  </button>
                )}
              </p>
              {clubs.length === 0 ? (
                unavailable ? (
                  <p mix={[insetStyles, unavailableStyles]}>Couldn't load your clubs right now</p>
                ) : (
                  <BuildYourStack preview={stackPreview} onChoose={chooseClubs} />
                )
              ) : (
                <ClubList clubs={clubs} matches={matches} clock={clock} onOpenMatch={showMatch} />
              )}
            </section>
          </>
        )}
      </Sheet>
    );
  };
});

// Until the client has picked a layout, a wide display shows nothing rather than flashing the
// phone layout it's about to replace. Phones never match the query, so nothing changes there.
const pendingStyles = css({
  [`@media ${WIDE_QUERY} and (scripting: enabled)`]: {
    visibility: 'hidden',
  },
});

const headerStyles = css({
  padding: `calc(${v('--safe-area-inset-top')} + ${space(3.5)}) ${v('--gutter')} 0`,
});

const insetStyles = css({
  padding: `0 ${v('--gutter')}`,
});

const brandStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(2.5),
  touchAction: 'manipulation',
  userSelect: 'none',
  WebkitUserSelect: 'none',
});

const sectionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
});

const subtitleStyles = css({
  textTransform: 'uppercase',
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  color: v('--color-text-secondary'),
});

const clubsSectionStyles = css({
  flex: '1',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
});

const clubsEmptyStyles = css({
  paddingBottom: `calc(${v('--safe-area-inset-bottom')} + ${space(3)})`,
});

// The list runs to the bottom edge and pads (and fades) the home indicator itself.
const clubsListStyles = css({
  paddingBottom: 0,
});

const clubsLabelStyles = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
});

const editStyles = css({
  margin: `${space(-1)} 0`,
  padding: `${space(1)} ${space(0.5)} ${space(1)} ${space(2.5)}`,
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-semibold'),
  textTransform: 'none',
  color: v('--color-accent'),
  transition: `opacity 140ms ${v('--ease-out')}`,

  '&:active': {
    opacity: 0.5,
  },
});

const titleStyles = css({
  fontSize: v('--text-2xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
});

const unavailableStyles = css({
  fontSize: v('--text-sm'),
  color: v('--color-text-secondary'),
});
