import { css, on, type Handle } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { ClubMatches, Fixture, Opponent, Venue } from '../../../lib/club-matches.ts';
import type { Club } from '../../../lib/clubs.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import {
  countdown,
  day,
  ordinal,
  resultWord,
  shortDate,
  soon,
  time,
  versus,
} from '../../../lib/match-format.ts';
import {
  findStanding,
  pointsPerGame,
  rowsAround,
  signed,
  standingRow,
  totalRows,
} from '../../../lib/standings.ts';
import type { StandingsResponse } from '../../../lib/types/api.ts';
import { space, v } from '../../../ui/theme.ts';
import { CompetitionMark } from '../clubs/club-card.tsx';
import { ClubCrest } from '../clubs/club-crest.tsx';
import type { MatchesEntry } from '../clubs/matches.ts';
import { countRender } from '../perf/renders.ts';
import type { Plan } from './flow.ts';
import { FlowGrid } from './flow-grid.tsx';
import {
  Chevron,
  cardStyles,
  dateCellStyles,
  infoStyles,
  labelStyles,
  listStyles,
  resultColors,
  whenStyles,
} from './parts.tsx';
import type { Selection } from './selection.ts';
import { WideTable } from './wide-table.tsx';

// A club's page in the wide layout. On a phone the club card's timeline tells the whole story in
// one strip; here there's room to lay it out, so the page doesn't repeat it. The next match gets
// a card with both clubs side by side, then the fixtures after it, then the last five, each with
// the opponent's standing.

const CLUB_PLANS: Plan[] = [
  { min: 0, cols: [['next', 'fixtures', 'results', 'season', 'league', 'cl']] },
  { min: 500, cols: [['next', 'fixtures', 'results'], ['season', 'league', 'cl']] },
  { min: 760, cols: [['next', 'fixtures'], ['results', 'season'], ['league', 'cl']] },
];

const VENUE: Record<Venue, string> = { H: 'Home', A: 'Away' };

type Props = {
  club: Club;
  standings: StandingsResponse[];
  entry: MatchesEntry | undefined;
  clock: Clock;
  onSelect: (selection: Selection) => void;
  onRetry: () => void;
};

export function ClubPage(handle: Handle<Props>) {
  return () => {
    countRender('ClubPage');
    const { club, standings, entry, clock, onSelect, onRetry } = handle.props;
    const matches = entry && entry.status !== 'error' ? entry.matches : undefined;
    const league = findStanding(standings, club.competitionCode);
    const row = standingRow(standings, club.competitionCode, club.id);
    const inCL = club.competitionCode !== 'CL' ? standingRow(standings, 'CL', club.id) : undefined;
    const position = (code: string, id: number) => {
      const found = standingRow(standings, code, id);
      return found ? `${ordinal(found.position)} ${getCompetitionMetadata(code).short}` : '';
    };

    const summary = [
      `${ordinal(club.position)} in ${league?.competition.name ?? getCompetitionMetadata(club.competitionCode).short}`,
      row && `${row.points} pts`,
      inCL && `${ordinal(inCL.position)} in UCL`,
    ].filter(Boolean);

    return (
      <>
        <header mix={headStyles}>
          <ClubCrest crest={club.crest} size={space(15)} />
          <div mix={headIdStyles}>
            <h2>{club.name}</h2>
            <p>{summary.join(' · ')}</p>
          </div>
        </header>
        <FlowGrid
          plans={CLUB_PLANS}
          blocks={{
            next: matches ? (
              <NextMatch club={club} fixture={matches.fixtures[0]} standings={standings} clock={clock} />
            ) : (
              <MatchesPending failed={entry?.status === 'error'} onRetry={onRetry} />
            ),
            fixtures: matches && matches.fixtures.length > 1 && (
              <AfterThat fixtures={matches.fixtures.slice(1)} clock={clock} position={position} />
            ),
            results: matches && matches.form.length > 0 && (
              <LastResults matches={matches} clock={clock} position={position} />
            ),
            season: row && <Season code={club.competitionCode} row={row} />,
            league: league && <MiniTable standing={league} clubId={club.id} onSelect={onSelect} />,
            cl: inCL && (
              <MiniTable standing={findStanding(standings, 'CL')!} clubId={club.id} onSelect={onSelect} />
            ),
          }}
        />
      </>
    );
  };
}

type PositionOf = (code: string, clubId: number) => string;

// ── next match: the two clubs face each other over the countdown, their lines underneath

type NextProps = { club: Club; fixture: Fixture | undefined; standings: StandingsResponse[]; clock: Clock };

function NextMatch(handle: Handle<NextProps>) {
  return () => {
    const { club, fixture, standings, clock } = handle.props;
    if (!fixture) {
      return (
        <>
          <p mix={labelStyles}>Next match</p>
          <div mix={[cardStyles, emptyCardStyles]}>No upcoming matches</div>
        </>
      );
    }
    const date = new Date(fixture.utcDate);
    const us: Opponent = { id: club.id, name: club.name, tla: '', crest: club.crest };
    const [home, away] = fixture.venue === 'H' ? [us, fixture.opponent] : [fixture.opponent, us];
    const competition =
      findStanding(standings, fixture.competition)?.competition.name ??
      getCompetitionMetadata(fixture.competition).short;

    return (
      <>
        <p mix={labelStyles}>Next match</p>
        <div mix={[cardStyles, nextStyles]}>
          <p mix={nextWhenStyles}>
            <CompetitionMark code={fixture.competition} /> {competition} · {VENUE[fixture.venue]}
          </p>
          <div mix={versusStyles}>
            <Side team={home} us={home.id === club.id} />
            <span mix={versusMarkStyles} aria-hidden='true'>v</span>
            <Side team={away} us={away.id === club.id} />
          </div>
          <p mix={clockStyles}>
            <span mix={countStyles}>
              {countdown(date, clock).flatMap(([n, unit]) => [String(n), <small key={unit}>{unit}</small>])}
            </span>
            <small>
              {day(date, clock)} {shortDate(date, clock)} · {time(date, clock)}
            </small>
          </p>
          <Tape standings={standings} code={fixture.competition} homeId={home.id} awayId={away.id} />
        </div>
      </>
    );
  };
}

function Side(handle: Handle<{ team: Opponent; us: boolean }>) {
  return () => {
    const { team, us } = handle.props;
    return (
      <span mix={sideStyles} data-us={us ? '' : undefined}>
        <ClubCrest crest={team.crest} size={space(14)} />
        <b>{team.name}</b>
      </span>
    );
  };
}

// Both clubs' lines in the competition they're about to meet in, home side on the left. The
// better side of each line reads brighter.
function Tape(handle: Handle<{ standings: StandingsResponse[]; code: string; homeId: number; awayId: number }>) {
  return () => {
    const { standings, code, homeId, awayId } = handle.props;
    const a = standingRow(standings, code, homeId);
    const b = standingRow(standings, code, awayId);
    if (!a || !b) return null;
    const lines: Array<[string, string, string, number]> = [
      ['Position', ordinal(a.position), ordinal(b.position), b.position - a.position],
      ['Points', String(a.points), String(b.points), a.points - b.points],
      ['Per game', pointsPerGame(a).toFixed(2), pointsPerGame(b).toFixed(2), pointsPerGame(a) - pointsPerGame(b)],
      ['W–D–L', `${a.won}–${a.draw}–${a.lost}`, `${b.won}–${b.draw}–${b.lost}`, 0],
      ['Goal diff', signed(a.goalDifference), signed(b.goalDifference), a.goalDifference - b.goalDifference],
    ];
    return (
      <dl mix={tapeStyles}>
        {lines.map(([label, home, away, better]) => (
          <div key={label} data-better={better > 0 ? 'home' : better < 0 ? 'away' : undefined}>
            <dd>{home}</dd>
            <dt>{label}</dt>
            <dd>{away}</dd>
          </div>
        ))}
      </dl>
    );
  };
}

function MatchesPending(handle: Handle<{ failed: boolean; onRetry: () => void }>) {
  return () => {
    const { failed, onRetry } = handle.props;
    return (
      <>
        <p mix={labelStyles}>Next match</p>
        <div mix={[cardStyles, emptyCardStyles]} aria-busy={failed ? undefined : 'true'}>
          {failed ? (
            <>
              Couldn't load matches
              <button type='button' mix={[retryStyles, on('click', onRetry)]}>
                Retry
              </button>
            </>
          ) : (
            <span mix={skeletonStyles} aria-label='Loading matches' />
          )}
        </div>
      </>
    );
  };
}

// ── the fixtures after the next one, and the last five results

function DateCell(handle: Handle<{ date: Date; clock: Clock }>) {
  return () => {
    const { date, clock } = handle.props;
    const [dayOfMonth, month] = shortDate(date, clock).split(' ');
    return (
      <span mix={dateCellStyles}>
        <b>
          {day(date, clock)} {dayOfMonth}
        </b>
        {month}
      </span>
    );
  };
}

function AfterThat(handle: Handle<{ fixtures: Fixture[]; clock: Clock; position: PositionOf }>) {
  return () => {
    const { fixtures, clock, position } = handle.props;
    return (
      <>
        <p mix={labelStyles}>After that</p>
        <ol mix={[cardStyles, listStyles]}>
          {fixtures.map((fixture, i) => {
            const date = new Date(fixture.utcDate);
            return (
              <li key={`${fixture.utcDate}-${i}`}>
                <DateCell date={date} clock={clock} />
                <ClubCrest crest={fixture.opponent.crest} size={space(8)} />
                <span mix={infoStyles}>
                  <span mix={whenStyles}>
                    {time(date, clock)} · {VENUE[fixture.venue]} <CompetitionMark code={fixture.competition} />
                  </span>
                  <b>{versus(fixture.venue, fixture.opponent.name)}</b>
                </span>
                <span mix={endStyles}>
                  <b>{soon(date, clock)}</b>
                  <small>{position(fixture.competition, fixture.opponent.id)}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </>
    );
  };
}

function LastResults(handle: Handle<{ matches: ClubMatches; clock: Clock; position: PositionOf }>) {
  return () => {
    const { matches, clock, position } = handle.props;
    const form = matches.form;
    const tally = (outcome: string) => form.filter((match) => match.result === outcome).length;
    const scored = form.reduce((sum, match) => sum + match.gf, 0);
    const conceded = form.reduce((sum, match) => sum + match.ga, 0);

    return (
      <>
        <p mix={labelStyles}>
          <span>Last {form.length}</span>
          <span mix={tallyStyles}>
            <b data-r='W'>{tally('W')}W</b> <b data-r='D'>{tally('D')}D</b> <b data-r='L'>{tally('L')}L</b> · {scored}–{conceded}
          </span>
        </p>
        <ol mix={[cardStyles, listStyles]}>
          {[...form].reverse().map((match, i) => {
            const date = new Date(match.utcDate);
            return (
              <li key={`${match.utcDate}-${i}`}>
                <DateCell date={date} clock={clock} />
                <ClubCrest crest={match.opponent.crest} size={space(8)} />
                <span mix={infoStyles}>
                  <span mix={whenStyles}>
                    {resultWord[match.result]} · {VENUE[match.venue]} <CompetitionMark code={match.competition} />
                  </span>
                  <b>{versus(match.venue, match.opponent.name)}</b>
                </span>
                <span mix={endStyles}>
                  <b data-r={match.result} mix={scoreStyles}>
                    {match.gf}–{match.ga}
                  </b>
                  <small>{position(match.competition, match.opponent.id)}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </>
    );
  };
}

// ── the season so far, and the club's corner of each table it plays in

function Season(handle: Handle<{ code: string; row: NonNullable<ReturnType<typeof standingRow>> }>) {
  return () => {
    const { code, row } = handle.props;
    const stats: Array<[string, string]> = [
      ['Played', String(row.playedGames)],
      ['Points', String(row.points)],
      ['Per game', pointsPerGame(row).toFixed(2)],
      ['Scored', String(row.goalsFor)],
      ['Conceded', String(row.goalsAgainst)],
      ['Diff', signed(row.goalDifference)],
    ];
    const bar: Array<[string, number]> = [
      ['W', row.won],
      ['D', row.draw],
      ['L', row.lost],
    ];

    return (
      <>
        <p mix={labelStyles}>Season · {getCompetitionMetadata(code).short}</p>
        <div mix={[cardStyles, seasonStyles]}>
          {row.playedGames > 0 && (
            <div
              mix={barStyles}
              role='img'
              aria-label={`${row.won} won, ${row.draw} drawn, ${row.lost} lost`}
            >
              {bar
                .filter(([, count]) => count > 0)
                .map(([outcome, count]) => (
                  <i key={outcome} data-r={outcome} style={{ flex: String(count) }}>
                    <b>{count}</b>
                    {outcome}
                  </i>
                ))}
            </div>
          )}
          <dl mix={statsStyles}>
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </>
    );
  };
}

function MiniTable(handle: Handle<{ standing: StandingsResponse; clubId: number; onSelect: (selection: Selection) => void }>) {
  return () => {
    const { standing, clubId, onSelect } = handle.props;
    const code = standing.competition.code;
    return (
      <>
        <p mix={labelStyles}>{standing.competition.name}</p>
        <div mix={cardStyles}>
          <WideTable
            caption={`${standing.competition.name} standings around your club`}
            rows={rowsAround(totalRows(standing), clubId)}
            mine={new Set([clubId])}
          />
          <button
            type='button'
            mix={[moreStyles, on('click', () => onSelect({ kind: 'competition', code }))]}
          >
            Full table
            <Chevron />
          </button>
        </div>
      </>
    );
  };
}

// ───────── styles ─────────

const headStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(4),
  padding: `${space(2)} 0`,
});

const headIdStyles = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: space(1.5),
  minWidth: 0,

  '& h2': {
    overflow: 'hidden',
    fontSize: v('--text-2xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    lineHeight: v('--leading-none'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },

  '& p': {
    fontSize: v('--text-xs'),
    color: v('--color-text-secondary'),
  },
});

const emptyCardStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space(3),
  minHeight: space(15),
  padding: `0 ${space(4)}`,
  fontSize: v('--text-xs'),
  color: v('--color-text-secondary'),
});

const retryStyles = css({
  margin: `${space(-2)} ${space(-1)} ${space(-2)} 0`,
  padding: space(2),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-bold'),
  color: v('--color-accent'),
  transition: `opacity 140ms ${v('--ease-out')}`,

  '&:active': {
    opacity: 0.5,
  },
});

const skeletonStyles = css({
  '@keyframes wide-pulse': {
    '50%': { opacity: 0.5 },
  },

  width: '55%',
  height: space(3),
  borderRadius: v('--radius-full'),
  background: v('--color-separator'),
  animation: `wide-pulse 1.4s ${v('--ease-out')} infinite`,
});

const nextStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(4),
  padding: space(4),
});

const nextWhenStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space(1.5),
  fontSize: v('--text-2xs'),
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-text-secondary'),
  whiteSpace: 'nowrap',
});

const versusStyles = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: space(2),
});

const versusMarkStyles = css({
  fontSize: v('--text-2xs'),
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-text-tertiary'),
});

const sideStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(2.5),
  minWidth: 0,
  textAlign: 'center',

  '& b': {
    maxWidth: '100%',
    overflow: 'hidden',
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    color: v('--color-text-secondary'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },

  '&[data-us] b': {
    color: v('--color-text'),
  },

  // A narrow column keeps names readable with smaller crests.
  '@container (max-width: 18rem)': {
    '& [data-club-crest]': {
      '--crest-size': `${space(11)} !important`,
    },
  },
});

const clockStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(1.5),

  '& > small': {
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    whiteSpace: 'nowrap',
  },
});

const countStyles = css({
  fontSize: v('--text-2xl'),
  fontWeight: v('--font-weight-extrabold'),
  letterSpacing: v('--tracking-tighter'),
  lineHeight: v('--leading-none'),
  fontVariantNumeric: 'tabular-nums',

  '& small': {
    margin: `0 ${space(0.5)}`,
    fontSize: v('--text-unit'),
    fontWeight: v('--font-weight-semibold'),
    color: v('--color-text-secondary'),
  },
});

const tapeStyles = css({
  display: 'flex',
  flexDirection: 'column',
  margin: 0,
  paddingTop: space(1),
  boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,

  '& > div': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    height: space(8),
  },

  '& dt': {
    fontSize: v('--text-3xs'),
    fontWeight: v('--font-weight-semibold'),
    textTransform: 'uppercase',
    textAlign: 'center',
    color: v('--color-text-tertiary'),
  },

  '& dd': {
    margin: 0,
    padding: `0 ${space(2)}`,
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-bold'),
    textAlign: 'center',
    color: v('--color-text-secondary'),
    fontVariantNumeric: 'tabular-nums',
  },

  '& [data-better="home"] dd:first-of-type, & [data-better="away"] dd:last-of-type': {
    fontWeight: v('--font-weight-extrabold'),
    color: v('--color-text'),
  },
});

const endStyles = css({
  display: 'flex',
  flex: 'none',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '2px',
  marginLeft: 'auto',
  textAlign: 'right',

  '& b': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
  },

  '& small': {
    fontSize: v('--text-2xs'),
    color: v('--color-text-tertiary'),
    whiteSpace: 'nowrap',
  },
});

const scoreStyles = css(resultColors);

const tallyStyles = css({
  textTransform: 'none',
  fontVariantNumeric: 'tabular-nums',

  '& b': {
    fontWeight: v('--font-weight-extrabold'),
  },

  '& b[data-r="W"]': { color: v('--color-win') },
  '& b[data-r="D"]': { color: v('--color-draw') },
  '& b[data-r="L"]': { color: v('--color-loss') },
});

const seasonStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(4),
  padding: space(4),
});

const barStyles = css({
  display: 'flex',
  gap: '3px',
  height: space(8),

  '& i': {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    minWidth: 'max-content',
    padding: `0 ${space(2)}`,
    borderRadius: space(1.5),
    fontStyle: 'normal',
    fontSize: v('--text-3xs'),
    fontWeight: v('--font-weight-bold'),
    color: v('--color-bg'),
  },

  '& i b': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
  },

  '& i[data-r="W"]': { background: v('--color-win') },
  '& i[data-r="D"]': { background: v('--color-draw') },
  '& i[data-r="L"]': { background: v('--color-loss') },
});

const statsStyles = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: `${space(4)} ${space(3)}`,
  margin: 0,

  '& div': {
    display: 'flex',
    flexDirection: 'column',
    gap: space(1),
  },

  '& dt': {
    fontSize: v('--text-3xs'),
    fontWeight: v('--font-weight-semibold'),
    textTransform: 'uppercase',
    color: v('--color-text-tertiary'),
  },

  '& dd': {
    margin: 0,
    fontSize: v('--text-xl'),
    fontWeight: v('--font-weight-extrabold'),
    letterSpacing: v('--tracking-tighter'),
    fontVariantNumeric: 'tabular-nums',
  },
});

const moreStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: space(1),
  width: '100%',
  height: space(10),
  padding: `0 ${space(3)}`,
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-semibold'),
  color: v('--color-accent'),
  boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,

  '&:active': {
    background: v('--color-press'),
  },

  '& svg': {
    width: space(3.5),
    height: space(3.5),
  },
});
