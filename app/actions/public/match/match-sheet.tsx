import { css, on, ref, type Handle } from 'remix/component';

import type { Clock } from '../../../lib/clock.ts';
import type { Club } from '../../../lib/clubs.ts';
import type { PlayedMatch } from '../../../lib/club-matches.ts';
import { getCompetitionMetadata } from '../../../lib/competition-metadata.ts';
import { day, shortDate, time } from '../../../lib/match-format.ts';
import type { MatchReport, Pair, ReportClub, Side, StatKey } from '../../../lib/match-report.ts';
import { momentLabel, replayOf, shortName, type Moment, type Replay, type Swing } from '../../../lib/match-replay.ts';
import { space, v } from '../../../ui/theme.ts';
import { Value } from '../motion.ts';
import { countRender } from '../perf/renders.ts';
import { sheetGrab, sheetScroll } from '../sheet.tsx';
import { ClubCrest } from '../clubs/club-crest.tsx';
import { CompetitionMark } from '../clubs/club-card.tsx';
import { areaPath } from './curve.ts';
import { Lineups } from './lineups.tsx';
import type { MatchReportsModel } from './reports.ts';
import { wireScrub } from './scrub.ts';

// The match sheet: a finished match, opened from a result. The header and the replay strip are
// the masthead; stats and key moments are cards below it. Drag the strip (or tap a moment) and
// the score, clock, time in front and moments rewind to that minute. Once the strip scrolls
// under the top edge, a compact copy docks there so it can still be scrubbed.
//
// The strip draws FotMob's momentum when the report has it: who was on top, minute by minute,
// home above the line and away below. Without it, it shades the stretches a side was ahead.
//
// Lineups come next: one side's starting XI on their half of the pitch, then the other's (see
// lineups.tsx).
//
// Everything past the score depends on what the server could find: events, stats and lineups
// come from FotMob, or from football-data's paid plans. Without events there's no strip and no
// moments; without stats there are no totals; without lineups there's no pitch.

/** Opens the match sheet for one of a club's results, from the button the user pressed. */
export type OpenMatch = (club: Club, match: PlayedMatch, button: HTMLButtonElement) => void;

type Props = {
  club: Club;
  match: PlayedMatch;
  reports: MatchReportsModel;
  clock: Clock;
  titleId: string;
  onClose: () => void;
};

type Strip = { chart: HTMLElement; head: HTMLElement; clip: Element; width: number };

const GRAB_ROWS = 11;
/** The playhead counts as kick-off this close to 0. */
const KICK_OFF = 0.01;

export function MatchSheet(handle: Handle<Props>) {
  const { club, match, reports } = handle.props;
  let report: MatchReport | null = null;
  let replay: Replay | null = null;
  let playhead: Value | null = null;
  /** The minute the screen shows, or null at full time. */
  let t: number | null = null;
  let scrubbed = false;
  const strips = new Set<Strip>();
  let root: HTMLElement | undefined;
  let dock: HTMLElement | undefined;
  let mainStrip: HTMLElement | undefined;

  // What the screen shows only changes at a new minute, score, moment or whole minute of time in
  // front or on top; the playhead itself moves every frame without a render. Kick-off is its own
  // state, since the label already reads 1' just after it.
  const shownKey = (at: number | null) =>
    !replay || at === null
      ? 'FT'
      : [
          at <= KICK_OFF ? 'KO' : replay.label(at),
          replay.scoreAt(at).join(),
          replay.moments.filter((m) => m.t <= at).length,
          replay.timeInFront(at).map(Math.round).join(),
          replay.timeOnTop(at).map(Math.round).join(),
        ].join('|');

  function paint(position: number) {
    if (!replay) return;
    for (const strip of strips) paintStrip(strip, position);
    const next = position >= replay.end - 0.01 ? null : position;
    if (shownKey(next) !== shownKey(t)) {
      t = next;
      handle.update();
    }
  }

  function paintStrip(strip: Strip, position: number) {
    if (!replay) return;
    strip.head.style.transform = `translateX(${(position / replay.end) * strip.width}px)`;
    strip.clip.setAttribute('width', String(position));
  }

  function sync() {
    const entry = reports.get(match.id);
    if (entry?.status !== 'ready' || entry.report === report) return;
    report = entry.report;
    replay = replayOf(report);
    playhead?.stop();
    t = null;
    playhead = replay ? new Value(replay.end, paint) : null;
  }

  reports.addEventListener('change', (event) => {
    if (event.matchId !== match.id) return;
    sync();
    handle.update();
  }, { signal: handle.signal });
  handle.queueTask(() => reports.load(club.id, match.id));
  handle.signal.addEventListener('abort', () => playhead?.stop());
  sync();

  const markScrubbed = () => {
    if (scrubbed) return;
    scrubbed = true;
    root?.setAttribute('data-scrubbed', '');
  };

  function goTo(target: number) {
    if (!playhead) return;
    markScrubbed();
    void playhead.to(target, { velocity: 0, precision: 0.02 });
  }

  function attachStrip(chart: HTMLElement, signal: AbortSignal) {
    if (!replay || !playhead) return;
    const strip: Strip = {
      chart,
      head: chart.querySelector<HTMLElement>('[data-head]')!,
      clip: chart.querySelector('[data-clip]')!,
      width: chart.clientWidth,
    };
    strips.add(strip);
    const resize = new ResizeObserver(() => {
      strip.width = chart.clientWidth;
      if (playhead) paintStrip(strip, playhead.value);
    });
    resize.observe(chart);
    signal.addEventListener('abort', () => {
      strips.delete(strip);
      resize.disconnect();
    });
    paintStrip(strip, playhead.value);
    const current = replay;
    wireScrub(chart, signal, {
      end: current.end,
      playhead,
      snap: (at) => current.snap(at),
      onScrub: markScrubbed,
    });
  }

  // Dock the compact strip once the full one has slid under the top edge.
  function attachScroller(scroller: HTMLElement, signal: AbortSignal) {
    let frame = 0;
    let docked = false;
    const check = () => {
      frame = 0;
      if (!mainStrip || !dock || !root) return;
      const under = mainStrip.getBoundingClientRect().bottom < dock.getBoundingClientRect().bottom;
      if (under === docked) return;
      docked = under;
      root.toggleAttribute('data-docked', under);
      dock.inert = !under;
    };
    scroller.addEventListener('scroll', () => {
      if (!frame) frame = requestAnimationFrame(check);
    }, { passive: true, signal });
    signal.addEventListener('abort', () => cancelAnimationFrame(frame));
  }

  return () => {
    countRender('MatchSheet');
    const { clock, titleId, onClose } = handle.props;
    const entry = reports.get(match.id);
    const date = new Date(match.utcDate);

    // Until the report arrives, the result the user tapped is enough for the header.
    const us: ReportClub = { id: club.id, name: club.name, tla: '', crest: club.crest };
    const them: ReportClub = { ...match.opponent };
    const seedHome = match.venue === 'H';
    const home = report?.home ?? (seedHome ? us : them);
    const away = report?.away ?? (seedHome ? them : us);
    const usSide: Side = home.id === club.id ? 'home' : 'away';
    const fullTime: Pair = report?.fullTime ?? (seedHome ? [match.gf, match.ga] : [match.ga, match.gf]);
    const score = replay && t !== null ? replay.scoreAt(t) : fullTime;
    const metadata = getCompetitionMetadata(report?.competition ?? match.competition);
    const tone = (side: Side) => (side === usSide ? 'us' : 'them');

    const meta = [
      `${day(date, clock)} ${shortDate(date, clock)} · ${time(date, clock)}`,
      report?.venue,
      report?.attendance ? `${report.attendance.toLocaleString('en-GB')} there` : null,
      report?.referee ? `Ref ${report.referee}` : null,
    ].filter(Boolean).join(' · ');

    return (
      <div
        mix={[rootStyles, ref((node) => (root = node))]}
        data-match-sheet
        data-scrubbed={scrubbed ? '' : undefined}
        style={{ '--us': v('--color-accent'), '--them': v('--color-opponent') }}
      >
        <div data-sheet-grab mix={[sheetGrab, grabStyles]}>
          <p mix={miniScoreStyles} aria-hidden='true'>
            <ClubCrest crest={home.crest} size={space(5)} />
            <b>{score.join('–')}</b>
            <ClubCrest crest={away.crest} size={space(5)} />
          </p>
          <button type='button' data-sheet-autofocus mix={[doneStyles, on('click', onClose)]}>
            Done
          </button>
        </div>

        {replay && (
          <div
            mix={[dockStyles, ref((node) => {
              dock = node;
              dock.inert = true;
            })]}
            data-dock
          >
            {strip(replay, 'dock', true)}
            <button
              type='button'
              aria-label='Back to full time'
              data-show={t !== null ? '' : undefined}
              mix={[dockFullTimeStyles, on('click', () => goTo(replay!.end))]}
            >
              FT
            </button>
          </div>
        )}

        <div
          mix={[sheetScroll, scrollStyles, ref((node, signal) => attachScroller(node, signal))]}
          tabIndex={0}
        >
          <header mix={headerStyles} data-reveal>
            <h2 id={titleId} mix={visuallyHidden}>
              {home.name} {fullTime[0]}–{fullTime[1]} {away.name}
            </h2>
            <p mix={competitionStyles}>
              <CompetitionMark code={report?.competition ?? match.competition} />
              {report?.competitionName ?? metadata.short}
              {report?.matchday ? ` · Matchday ${report.matchday}` : ''}
            </p>
            <div mix={faceStyles}>
              <Team club={home} us={usSide === 'home'} />
              <div mix={middleStyles}>
                <p mix={scoreStyles} aria-hidden='true'>
                  <span key={`h${score[0]}`}>{score[0]}</span>
                  <i>–</i>
                  <span key={`a${score[1]}`}>{score[1]}</span>
                </p>
                <p mix={clockStyles} data-live={t !== null ? '' : undefined}>
                  {t === null || !replay ? 'Full time' : t <= KICK_OFF ? 'Kick-off' : replay.label(t)}
                </p>
              </div>
              <Team club={away} us={usSide === 'away'} />
            </div>
            {replay ? (
              <Scorers replay={replay} t={t} />
            ) : report?.halfTime ? (
              <p mix={halfTimeStyles}>Half time {report.halfTime.join('–')}</p>
            ) : null}
            <p mix={metaStyles}>{meta}</p>
          </header>

          <div mix={bodyStyles}>
            {!entry || entry.status === 'loading' ? (
              <Pending />
            ) : entry.status === 'error' && !report ? (
              <div mix={problemStyles} data-reveal>
                <b>Couldn't load this match</b>
                <button type='button' mix={[retryStyles, on('click', () => reports.load(club.id, match.id))]}>
                  Retry
                </button>
              </div>
            ) : report ? (
              <>
                {replay && (
                  <section mix={replayStyles} aria-label='Replay' data-reveal>
                    <div mix={replayTopStyles}>
                      <p mix={labelStyles}>
                        Replay <span>drag the strip</span>
                      </p>
                      <button
                        type='button'
                        data-show={t !== null ? '' : undefined}
                        mix={[fullTimeStyles, on('click', () => goTo(replay!.end))]}
                      >
                        Full time
                      </button>
                    </div>
                    {strip(replay, 'main', false)}
                    <Axis replay={replay} />
                    <p key={replay.captionAt(t ?? replay.end)} mix={captionStyles} aria-live='polite'>
                      {replay.captionAt(t ?? replay.end)}
                    </p>
                    <p mix={legendStyles}>
                      {replay.momentum
                        ? 'Momentum, minute by minute: '
                        : 'Shaded while a side was ahead, taller for a two-goal lead: '}
                      <b data-tone={tone('home')}>{home.tla || home.name}</b>
                      {replay.momentum ? ' on top above the line, ' : ' above the line, '}
                      <b data-tone={tone('away')}>{away.tla || away.name}</b> below.
                    </p>
                  </section>
                )}
                {report.lineups && (
                  <Lineups report={report} replay={replay} usSide={usSide} onSeek={goTo} />
                )}
                <div mix={columnsStyles}>
                  <Stats report={report} replay={replay} t={t} usSide={usSide} />
                  <Moments
                    report={report}
                    replay={replay}
                    t={t}
                    usSide={usSide}
                    onPick={goTo}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  function strip(current: Replay, id: string, compact: boolean) {
    const { end, half, states, moments, momentum } = current;
    const clipId = `${handle.id}-${id}`;
    const bands = momentum ? momentumBands(momentum, clipId) : states
      .filter((state) => state.lead !== 0)
      .map((state) => {
        const height = 20 + Math.min(2, Math.abs(state.lead)) * 12;
        const homeLeads = state.lead > 0;
        return (
          <rect
            key={state.from}
            x={state.from}
            y={homeLeads ? 50 - height : 50}
            width={state.to - state.from}
            height={height}
            rx={0.6}
            data-side={homeLeads ? 'home' : 'away'}
          />
        );
      });
    const usSide: Side = report?.home.id === club.id ? 'home' : 'away';
    const position = (at: number) => `${(at / end) * 100}%`;

    return (
      <div
        mix={[chartStyles, ref((node, signal) => {
          if (!compact) mainStrip = node as HTMLElement;
          attachStrip(node as HTMLElement, signal);
        })]}
        role='slider'
        tabIndex={0}
        data-compact={compact ? '' : undefined}
        aria-label='Match minute'
        aria-valuemin={0}
        aria-valuemax={Math.round(end)}
        aria-valuenow={Math.round(t ?? end)}
        aria-valuetext={t === null ? 'Full time' : current.label(t)}
        data-full={t === null ? '' : undefined}
        data-momentum={momentum ? '' : undefined}
        style={{ '--home': usSide === 'home' ? 'var(--us)' : 'var(--them)', '--away': usSide === 'away' ? 'var(--us)' : 'var(--them)' }}
      >
        <svg viewBox={`0 0 ${end} 100`} preserveAspectRatio='none' aria-hidden='true'>
          <defs>
            <clipPath id={clipId} clipPathUnits='userSpaceOnUse'>
              <rect data-clip x={0} y={-10} height={120} />
            </clipPath>
            {momentum && (
              <>
                <clipPath id={`${clipId}-home`} clipPathUnits='userSpaceOnUse'>
                  <rect x={-1} y={-10} width={end + 2} height={60} />
                </clipPath>
                <clipPath id={`${clipId}-away`} clipPathUnits='userSpaceOnUse'>
                  <rect x={-1} y={50} width={end + 2} height={60} />
                </clipPath>
              </>
            )}
          </defs>
          <line x1={0} x2={end} y1={50} y2={50} data-line='mid' />
          <line x1={half} x2={half} y1={2} y2={98} data-line='half' />
          <g data-dim>{bands}</g>
          <g clip-path={`url(#${clipId})`}>{bands}</g>
        </svg>
        <div mix={marksStyles} aria-hidden='true'>
          {moments
            .filter((m) => !compact || m.kind === 'goal')
            .map((m, i) => (
              <i
                key={i}
                data-kind={m.kind === 'card' ? m.card : m.kind}
                data-up={m.side === 'home' ? '' : undefined}
                data-tone={m.side === usSide ? 'us' : 'them'}
                style={{ left: position(m.t) }}
              />
            ))}
        </div>
        <div data-head mix={headStyles} aria-hidden='true'>
          <span>{t === null ? 'FT' : t <= KICK_OFF ? 'KO' : current.label(t)}</span>
        </div>
      </div>
    );
  }
}

// Momentum as one smooth area around the midline, split by clipping: the part above is the home
// side's colour, the part below the away side's. ±100 reaches most of the way to the edge,
// leaving the outer rim for goal and card marks.
const MOMENTUM_REACH = 40;

function momentumBands(momentum: Swing[], clipId: string) {
  const d = areaPath(momentum.map((s) => ({ x: s.t, y: 50 - (s.value / 100) * MOMENTUM_REACH })), 50);
  return [
    <g key='home' clip-path={`url(#${clipId}-home)`}>
      <path d={d} data-side='home' />
    </g>,
    <g key='away' clip-path={`url(#${clipId}-away)`}>
      <path d={d} data-side='away' />
    </g>,
  ];
}

function Team(handle: Handle<{ club: ReportClub; us: boolean }>) {
  return () => {
    const { club, us } = handle.props;
    return (
      <div mix={teamStyles} data-us={us ? '' : undefined}>
        <ClubCrest crest={club.crest} size={space(15)} />
        <b>{club.name}</b>
      </div>
    );
  };
}

function Scorers(handle: Handle<{ replay: Replay; t: number | null }>) {
  return () => {
    const { replay, t } = handle.props;
    const list = (side: Side) =>
      replay.moments
        .filter((m): m is Moment & { kind: 'goal' } => m.kind === 'goal' && m.side === side)
        .map((m, i) => (
          <li key={i} data-future={t !== null && m.t > t ? '' : undefined}>
            {shortName(m.player)}
            {m.goal === 'own' ? ' (og)' : m.goal === 'penalty' ? ' (pen)' : ''} <span>{momentLabel(m)}</span>
          </li>
        ));
    return (
      <div mix={scorersStyles}>
        <ol>{list('home')}</ol>
        <span aria-hidden='true' />
        <ol>{list('away')}</ol>
      </div>
    );
  };
}

function Axis(handle: Handle<{ replay: Replay }>) {
  return () => {
    const { end, half } = handle.props.replay;
    const second = (minute: number) => half + (minute - 45);
    const ticks: Array<[number, string]> = [
      [0, "0'"], [15, "15'"], [30, "30'"], [half, 'HT'], [second(60), "60'"], [second(75), "75'"], [end, 'FT'],
    ];
    return (
      <div mix={axisStyles} aria-hidden='true'>
        {ticks.map(([at, text]) => (
          <span key={text} style={{ left: `${(at / end) * 100}%` }}>
            {text}
          </span>
        ))}
      </div>
    );
  };
}

const STAT_ROWS: Array<[StatKey, string, (n: number) => string]> = [
  ['possession', 'Possession', (n) => `${n}%`],
  ['xg', 'Expected goals', (n) => n.toFixed(2)],
  ['shots', 'Shots', String],
  ['onTarget', 'On target', String],
  ['corners', 'Corners', String],
];

type StatsProps = { report: MatchReport; replay: Replay | null; t: number | null; usSide: Side };

function Stats(handle: Handle<StatsProps>) {
  return () => {
    const { report, replay, t, usSide } = handle.props;
    const rewound = t !== null;
    const rows: Array<{ key: string; label: string; pair: Pair; scale: number; format: (n: number) => string; total: boolean }> = [];
    for (const [key, label, format] of STAT_ROWS) {
      const pair = report.stats?.[key];
      if (!pair) continue;
      rows.push({ key, label, pair, format, total: true, scale: key === 'possession' ? 100 : Math.max(...pair) || 1 });
    }
    if (replay) {
      const front = replay.timeInFront(t ?? replay.end);
      rows.push({
        key: 'front',
        label: 'Time in front',
        pair: front,
        format: (n) => `${Math.round(n)}′`,
        total: false,
        scale: replay.end,
      });
      if (replay.momentum) {
        rows.push({
          key: 'top',
          label: 'Time on top',
          pair: replay.timeOnTop(t ?? replay.end),
          format: (n) => `${Math.round(n)}′`,
          total: false,
          scale: replay.end,
        });
      }
    }
    if (!rows.length && !report.odds) return null;
    const tone = (side: Side) => (side === usSide ? 'us' : 'them');

    return (
      <section mix={sectionStyles} data-reveal>
        <h3 mix={labelStyles}>
          Stats{' '}
          <span>
            {!rewound || !replay ? 'at full time' : report.stats ? 'full-time totals' : `at ${replay.label(t!)}`}
          </span>
        </h3>
        <dl mix={[cardStyles, statsStyles]} data-rewound={rewound ? '' : undefined}>
          {rows.map((row) => (
            <div
              key={row.key}
              mix={statStyles}
              data-total={row.total ? '' : undefined}
              data-better={row.pair[0] > row.pair[1] ? 'home' : row.pair[1] > row.pair[0] ? 'away' : undefined}
            >
              <dd>{row.format(row.pair[0])}</dd>
              <dt>
                {row.label}
                <small>FT</small>
              </dt>
              <dd>{row.format(row.pair[1])}</dd>
              <div mix={barStyles}>
                <span>
                  <i data-tone={tone('home')} style={{ transform: `scaleX(${row.pair[0] / row.scale})` }} />
                </span>
                <span>
                  <i data-tone={tone('away')} style={{ transform: `scaleX(${row.pair[1] / row.scale})` }} />
                </span>
              </div>
            </div>
          ))}
          {report.odds && (
            <div mix={oddsStyles}>
              <p>
                <span>Before kick-off</span>
                <span>
                  {report.home.tla} {report.odds[0]}% · Draw {report.odds[1]}% · {report.away.tla} {report.odds[2]}%
                </span>
              </p>
              <div aria-hidden='true'>
                <i data-tone={tone('home')} style={{ flex: report.odds[0] }} />
                <i data-tone='draw' style={{ flex: report.odds[1] }} />
                <i data-tone={tone('away')} style={{ flex: report.odds[2] }} />
              </div>
            </div>
          )}
        </dl>
      </section>
    );
  };
}

type MomentsProps = StatsProps & { onPick: (t: number) => void };

type Row =
  | { kind: 'moment'; t: number; moment: Moment }
  | { kind: 'break'; t: number; text: string; score: Pair };

function Moments(handle: Handle<MomentsProps>) {
  return () => {
    const { report, replay, t, usSide, onPick } = handle.props;

    if (!replay) {
      return (
        <section mix={sectionStyles} data-reveal>
          <h3 mix={labelStyles}>Key moments</h3>
          <div mix={[cardStyles, unavailableStyles]}>
            <p>Goal times, cards and substitutions aren't available for this match.</p>
          </div>
        </section>
      );
    }

    const rows: Row[] = [
      ...replay.moments.map((moment): Row => ({ kind: 'moment', t: moment.t, moment })),
      { kind: 'break' as const, t: replay.half, text: 'Half time', score: report.halfTime ?? replay.scoreAt(replay.half) },
      { kind: 'break' as const, t: replay.end, text: 'Full time', score: report.fullTime },
    ].sort((a, b) => a.t - b.t || (a.kind === 'break' ? 1 : -1));
    const at = t ?? replay.end;
    const current = t === null ? -1 : rows.findLastIndex((row) => row.t <= at + 1e-6);

    return (
      <section mix={sectionStyles} data-reveal>
        <h3 mix={labelStyles}>
          Key moments <span>tap to jump</span>
        </h3>
        <ol mix={[cardStyles, momentsStyles]}>
          {rows.map((row, i) => (
            <li
              key={i}
              data-future={row.t > at + 1e-6 ? '' : undefined}
              data-current={i === current ? '' : undefined}
            >
              {row.kind === 'break' ? (
                <button type='button' data-break mix={on('click', () => onPick(row.t))}>
                  <span>{row.text}</span>
                  <b>{row.score.join('–')}</b>
                </button>
              ) : (
                <MomentRow moment={row.moment} report={report} usSide={usSide} onPick={onPick} />
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  };
}

function MomentRow(
  handle: Handle<{ moment: Moment; report: MatchReport; usSide: Side; onPick: (t: number) => void }>,
) {
  return () => {
    const { moment: m, report, usSide, onPick } = handle.props;
    const club = report[m.side];
    const [who, what] =
      m.kind === 'goal'
        ? [
            shortName(m.player),
            m.goal === 'own' ? 'Own goal' : m.goal === 'penalty' ? 'Penalty' : m.assist ? `Assist ${shortName(m.assist)}` : 'Goal',
          ]
        : m.kind === 'card'
          ? [shortName(m.player), m.card === 'yellow' ? 'Yellow card' : m.card === 'red' ? 'Red card' : 'Second yellow']
          : [shortName(m.playerIn), `on for ${shortName(m.playerOut)}`];
    return (
      <button
        type='button'
        data-kind={m.kind === 'card' ? m.card : m.kind}
        data-tone={m.side === usSide ? 'us' : 'them'}
        mix={on('click', () => onPick(m.t))}
      >
        <span data-minute>{momentLabel(m)}</span>
        <span data-icon aria-hidden='true'>{m.kind === 'sub' ? '⇅' : ''}</span>
        <span data-who>
          <b>{who}</b>
          <small>
            {what} · {club.tla || club.name}
          </small>
        </span>
        {m.kind === 'goal' && <b data-score>{m.score.join('–')}</b>}
      </button>
    );
  };
}

function Pending() {
  return () => (
    <div mix={pendingStyles} aria-label='Loading match' aria-busy='true'>
      <i />
      <i />
      <i />
    </div>
  );
}

// ───────── styles ─────────

const ease = v('--ease-out');

const rootStyles = css({
  display: 'contents',
});

const visuallyHidden = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
});

const grabStyles = css({
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: space(GRAB_ROWS),
  padding: `0 ${space(2)}`,
  background: v('--color-surface'),
});

const miniScoreStyles = css({
  position: 'absolute',
  left: v('--gutter'),
  top: '50%',
  display: 'flex',
  alignItems: 'center',
  gap: space(2),
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-extrabold'),
  fontVariantNumeric: 'tabular-nums',
  opacity: 0,
  transform: 'translateY(-30%)',
  transition: `opacity 180ms ${ease}, transform 180ms ${ease}`,
  pointerEvents: 'none',

  '[data-docked] &': {
    opacity: 1,
    transform: 'translateY(-50%)',
  },
});

const doneStyles = css({
  padding: `${space(2)} ${space(2.5)}`,
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-bold'),
  color: v('--color-accent'),
  transition: `opacity 140ms ${ease}`,

  '&:active': { opacity: 0.5 },
  '&:focus-visible': { outline: `2px solid ${v('--color-accent')}`, borderRadius: v('--radius-md') },
});

// The docked strip hangs from the top edge: solid, with a hairline, so content passes under it.
const dockStyles = css({
  position: 'absolute',
  top: space(GRAB_ROWS),
  left: 0,
  right: 0,
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  gap: space(3),
  padding: `${space(1)} ${v('--gutter')} ${space(3)}`,
  background: v('--color-surface'),
  boxShadow: `inset 0 -0.5px 0 ${v('--color-separator')}, 0 0.75rem 1.25rem -1rem oklch(0% 0 0 / 0.8)`,
  opacity: 0,
  transform: `translateY(${space(-1.5)})`,
  transition: `opacity 180ms ${ease}, transform 220ms ${ease}`,
  pointerEvents: 'none',

  '[data-docked] &': {
    opacity: 1,
    transform: 'none',
    pointerEvents: 'auto',
  },
});

const dockFullTimeStyles = css({
  flex: 'none',
  width: space(9),
  height: space(9),
  borderRadius: v('--radius-full'),
  fontSize: v('--text-4xs'),
  fontWeight: v('--font-weight-extrabold'),
  color: v('--color-accent'),
  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${v('--color-accent')} 45%, transparent)`,
  opacity: 0.25,
  pointerEvents: 'none',
  transition: `opacity 160ms ${ease}, transform ${v('--duration-press')} ${ease}`,

  '&[data-show]': { opacity: 1, pointerEvents: 'auto' },
  '&:active': { transform: 'scale(0.94)' },
});

const scrollStyles = css({
  containerType: 'inline-size',
});

const reveal = (order: number) => ({
  '@keyframes match-reveal': {
    from: { opacity: 0, transform: `translateY(${space(2)})` },
    to: { opacity: 1, transform: 'none' },
  },
  animation: `match-reveal 320ms ${ease} ${120 + order * 40}ms backwards`,
});

const headerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(3),
  padding: `0 ${v('--gutter')} ${space(5)}`,
  textAlign: 'center',
  ...reveal(0),
});

const competitionStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.5),
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),
});

const faceStyles = css({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'start',
  gap: space(3),
  width: '100%',
});

const teamStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(2.5),
  minWidth: 0,

  '& b': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-bold'),
    color: v('--color-text-secondary'),
    overflowWrap: 'anywhere',
  },
  '&[data-us] b': { color: v('--color-text') },
});

const middleStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space(2),
  paddingTop: space(2),
});

const scoreStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: space(1.5),
  fontSize: '2.75rem',
  fontWeight: v('--font-weight-black'),
  letterSpacing: v('--tracking-tighter'),
  lineHeight: v('--leading-none'),
  fontVariantNumeric: 'tabular-nums',

  '& span': { display: 'inline-block', minWidth: '0.65em' },
  '& i': { fontStyle: 'normal', fontWeight: v('--font-weight-semibold'), color: v('--color-text-tertiary') },

  // A digit that changes while scrubbing rolls in; on open nothing moves.
  '@keyframes match-digit': {
    from: { opacity: 0.2, transform: 'translateY(0.3em)' },
    to: { opacity: 1, transform: 'none' },
  },
  '[data-scrubbed] & span': { animation: `match-digit 180ms ${ease}` },
});

const clockStyles = css({
  padding: `${space(0.5)} ${space(2)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-3xs'),
  fontWeight: v('--font-weight-bold'),
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontVariantNumeric: 'tabular-nums',
  color: v('--color-text-secondary'),
  boxShadow: `inset 0 0 0 1px ${v('--color-separator')}`,
  transition: `color 160ms ${ease}, box-shadow 160ms ${ease}`,

  '&[data-live]': {
    color: v('--color-accent'),
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${v('--color-accent')} 55%, transparent)`,
  },
});

const scorersStyles = css({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: space(3),
  width: '100%',
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),

  '& ol': { listStyle: 'none' },
  '& ol:first-child': { textAlign: 'right' },
  '& ol:last-child': { textAlign: 'left' },
  '& li': { lineHeight: 1.6, transition: `opacity 160ms ${ease}` },
  '& li[data-future]': { opacity: 0.3 },
  '& li span': { color: v('--color-text-tertiary') },
  '& > span': {
    width: space(1.5),
    height: space(1.5),
    marginTop: space(1.5),
    borderRadius: v('--radius-full'),
    background: v('--color-text-tertiary'),
  },
});

const halfTimeStyles = css({
  fontSize: v('--text-2xs'),
  color: v('--color-text-secondary'),
});

const metaStyles = css({
  fontSize: v('--text-2xs'),
  color: v('--color-text-tertiary'),
  textWrap: 'balance',
});

const bodyStyles = css({
  display: 'flex',
  flexDirection: 'column',
  padding: `0 ${v('--gutter')}`,
});

// The replay is part of the masthead: flat on the sheet, closed off by a hairline.
const replayStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2),
  margin: `0 calc(${v('--gutter')} * -1)`,
  padding: `${space(1)} ${v('--gutter')} ${space(6)}`,
  boxShadow: `inset 0 -0.5px 0 ${v('--color-separator')}`,
  ...reveal(1),
});

const replayTopStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: space(7),
});

const labelStyles = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: space(2),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-medium'),
  textTransform: 'uppercase',
  color: v('--color-text-secondary'),

  '& span': {
    textTransform: 'none',
    fontSize: v('--text-2xs'),
    color: v('--color-text-tertiary'),
  },
});

const fullTimeStyles = css({
  flex: 'none',
  padding: `${space(1.5)} ${space(2.5)}`,
  marginRight: space(-1.5),
  borderRadius: v('--radius-full'),
  fontSize: v('--text-2xs'),
  fontWeight: v('--font-weight-bold'),
  color: v('--color-accent'),
  whiteSpace: 'nowrap',
  opacity: 0,
  transform: 'scale(0.94)',
  pointerEvents: 'none',
  transition: `opacity 160ms ${ease}, transform 160ms ${ease}`,

  '&[data-show]': { opacity: 1, transform: 'none', pointerEvents: 'auto' },
  '&[data-show]:active': { transform: 'scale(0.97)' },
});

const chartStyles = css({
  position: 'relative',
  height: space(22),
  touchAction: 'pan-y',
  cursor: 'ew-resize',
  outline: 'none',

  '&:focus-visible': {
    borderRadius: v('--radius-md'),
    boxShadow: `0 0 0 2px ${v('--color-accent')}`,
  },
  '& svg': { display: 'block', width: '100%', height: '100%', overflow: 'visible' },
  '& [data-side="home"]': { fill: 'var(--home)', opacity: 0.55 },
  '& [data-side="away"]': { fill: 'var(--away)', opacity: 0.55 },
  '& g[data-dim] [data-side]': { opacity: 0.12 },
  // Momentum is the strip's main shape, so the played part reads stronger than lead bands.
  '&[data-momentum] [data-side]': { opacity: 0.7 },
  '&[data-momentum] g[data-dim] [data-side]': { opacity: 0.16 },
  '& line': { strokeWidth: 1, vectorEffect: 'non-scaling-stroke' },
  '& line[data-line="mid"]': { stroke: v('--color-separator') },
  '& line[data-line="half"]': { stroke: v('--color-text-tertiary'), strokeDasharray: '2 3' },

  '@container (min-width: 36rem)': {
    '&:not([data-compact])': { height: space(26) },
  },
  '&[data-compact]': { flex: '1', height: space(9) },
});

const marksStyles = css({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',

  '& i': {
    position: 'absolute',
    top: '91%',
    transform: 'translate(-50%, -50%)',
    boxShadow: `0 0 0 2px ${v('--color-surface')}`,
  },
  '& i[data-up]': { top: '9%' },
  '& i[data-kind="goal"]': {
    width: space(2.5),
    height: space(2.5),
    borderRadius: v('--radius-full'),
    background: v('--color-text'),
  },
  '& i[data-kind="yellow"], & i[data-kind="second-yellow"], & i[data-kind="red"]': {
    width: space(1.5),
    height: space(2.25),
    borderRadius: '1px',
    background: v('--color-warning'),
  },
  '& i[data-kind="second-yellow"], & i[data-kind="red"]': { background: v('--color-loss') },
  '& i[data-kind="sub"]': {
    top: 'auto',
    bottom: 0,
    width: '1px',
    height: space(1.5),
    boxShadow: 'none',
    background: v('--color-text-tertiary'),
    transform: 'translateX(-50%)',
  },
  '& i[data-kind="sub"][data-up]': { top: 0, bottom: 'auto' },
});

const headStyles = css({
  position: 'absolute',
  top: space(-1),
  bottom: space(-1),
  left: 0,
  width: 0,
  pointerEvents: 'none',
  willChange: 'transform',

  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '-0.75px',
    width: '1.5px',
    borderRadius: '1px',
    background: v('--color-text'),
    boxShadow: `0 0 0.75rem color-mix(in oklab, ${v('--color-text')} 40%, transparent)`,
  },
  '& span': {
    position: 'absolute',
    top: space(-2),
    left: 0,
    padding: `2px ${space(1.5)}`,
    borderRadius: v('--radius-full'),
    background: v('--color-text'),
    color: v('--color-bg'),
    fontSize: v('--text-4xs'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    transform: 'translate(-50%, -50%) scale(0.92)',
    transition: `transform 140ms ${ease}`,
  },
  '[data-scrubbing] & span': { transform: 'translate(-50%, -60%) scale(1.06)' },
  // At the whistle the label tucks inwards so it never clips.
  '[data-full] & span': { transform: 'translate(-90%, -50%) scale(0.92)' },
  // The docked strip is too short for a label.
  '[data-dock] &': { top: 0, bottom: 0 },
  '[data-dock] & span': { display: 'none' },
});

const axisStyles = css({
  position: 'relative',
  height: space(3),
  marginTop: space(1.5),

  '& span': {
    position: 'absolute',
    transform: 'translateX(-50%)',
    fontSize: v('--text-4xs'),
    color: v('--color-text-tertiary'),
    fontVariantNumeric: 'tabular-nums',
  },
  '& span:first-child': { transform: 'none' },
  '& span:last-child': { transform: 'translateX(-100%)' },
});

const captionStyles = css({
  minHeight: '1.4em',
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-semibold'),
  textWrap: 'balance',

  '@keyframes match-caption': {
    from: { opacity: 0.2 },
    to: { opacity: 1 },
  },
  '[data-scrubbed] &': { animation: `match-caption 200ms ${ease}` },
});

const legendStyles = css({
  fontSize: v('--text-3xs'),
  lineHeight: 1.5,
  color: v('--color-text-tertiary'),

  '& b[data-tone="us"]': { color: 'var(--us)' },
  '& b[data-tone="them"]': { color: 'var(--them)' },
});

const columnsStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(7),
  paddingTop: space(6),

  '@container (min-width: 36rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: space(4),
    alignItems: 'start',
  },
});

const sectionStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2),
  minWidth: 0,
  ...reveal(2),

  '& > h3': { padding: `0 ${space(1)}` },
});

const cardStyles = css({
  borderRadius: v('--radius-lg'),
  background: v('--card-fill'),
  boxShadow: v('--shadow-highlight'),
  overflow: 'hidden',
});

const statsStyles = css({
  display: 'flex',
  flexDirection: 'column',
  padding: `${space(1.5)} ${space(4)}`,
});

const statStyles = css({
  display: 'grid',
  gridTemplateColumns: `${space(12)} 1fr ${space(12)}`,
  alignItems: 'center',
  rowGap: space(1.5),
  padding: `${space(2.5)} 0`,

  '& + &': { boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}` },
  '& dt': {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space(1.5),
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
  },
  '& dt small': {
    display: 'none',
    padding: `1px ${space(1.25)}`,
    borderRadius: v('--radius-full'),
    fontSize: v('--text-4xs'),
    fontWeight: v('--font-weight-bold'),
    color: v('--color-text-tertiary'),
    boxShadow: `inset 0 0 0 1px ${v('--color-separator')}`,
  },
  '& dd': {
    margin: 0,
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
    color: v('--color-text-secondary'),
    transition: `color 160ms ${ease}`,
  },
  '& dd:last-of-type': { textAlign: 'right' },
  '&[data-better="home"] dd:first-of-type, &[data-better="away"] dd:last-of-type': {
    color: v('--color-text'),
  },
  // Totals can't rewind: while scrubbing they say so and step back.
  '[data-rewound] &[data-total] dt small': { display: 'inline-block' },
  '[data-rewound] &[data-total] dd, [data-rewound] &[data-total] > div': { opacity: 0.45 },
});

const barStyles = css({
  gridColumn: '1 / -1',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '3px',
  height: space(1.25),

  '& span': {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: v('--radius-full'),
    background: v('--color-well'),
  },
  '& i': {
    position: 'absolute',
    inset: 0,
    borderRadius: v('--radius-full'),
    transition: `transform 180ms ${ease}`,
  },
  '& span:first-child i': { transformOrigin: '100% 50%' },
  '& span:last-child i': { transformOrigin: '0 50%' },
  '& i[data-tone="us"]': { background: 'var(--us)' },
  '& i[data-tone="them"]': { background: 'var(--them)' },
});

const oddsStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(2),
  padding: `${space(3)} 0 ${space(2)}`,
  boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}`,

  '&:first-child': { boxShadow: 'none' },
  '& p': {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: `${space(1)} ${space(2)}`,
    fontSize: v('--text-3xs'),
    fontVariantNumeric: 'tabular-nums',
    color: v('--color-text-tertiary'),
  },
  '& p span': { whiteSpace: 'nowrap' },
  '& p span:last-child': { color: v('--color-text-secondary') },
  '& div': { display: 'flex', gap: '2px', height: space(1) },
  '& i': { borderRadius: v('--radius-full'), opacity: 0.7 },
  '& i[data-tone="us"]': { background: 'var(--us)' },
  '& i[data-tone="them"]': { background: 'var(--them)' },
  '& i[data-tone="draw"]': { background: v('--color-text-tertiary'), opacity: 0.5 },
});

const momentsStyles = css({
  display: 'flex',
  flexDirection: 'column',
  listStyle: 'none',
  padding: `${space(1.5)} 0`,

  '& li + li': { boxShadow: `inset 0 0.5px 0 ${v('--color-separator')}` },
  '& button': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: space(3),
    width: '100%',
    minHeight: space(13),
    padding: `${space(2)} ${space(4)}`,
    textAlign: 'left',
    transition: `opacity 160ms ${ease}, background-color 160ms ${ease}`,
  },
  '& button:active': { background: v('--color-press') },
  '& button:focus-visible': { outline: `2px solid ${v('--color-accent')}`, outlineOffset: '-2px' },
  '& li[data-future] button': { opacity: 0.32 },
  '& li[data-current] button': { background: `color-mix(in oklab, ${v('--color-accent')} 7%, transparent)` },
  '& li[data-current] button::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: '22%',
    bottom: '22%',
    width: '2px',
    borderRadius: '0 2px 2px 0',
    background: v('--color-accent'),
  },
  '& [data-minute]': {
    flex: 'none',
    width: space(11),
    fontSize: v('--text-xs'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
    color: v('--color-text-secondary'),
  },
  '& [data-icon]': {
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    width: space(4),
    height: space(4),
    fontSize: v('--text-xs'),
    color: v('--color-text-tertiary'),
  },
  '& [data-kind="goal"] [data-icon]::before': {
    content: '""',
    width: space(2.5),
    height: space(2.5),
    borderRadius: v('--radius-full'),
    background: 'var(--them)',
  },
  '& [data-kind="goal"][data-tone="us"] [data-icon]::before': { background: 'var(--us)' },
  '& [data-kind="yellow"] [data-icon]::before, & [data-kind="second-yellow"] [data-icon]::before, & [data-kind="red"] [data-icon]::before': {
    content: '""',
    width: space(2),
    height: space(2.75),
    borderRadius: '1.5px',
    background: v('--color-warning'),
  },
  '& [data-kind="second-yellow"] [data-icon]::before, & [data-kind="red"] [data-icon]::before': {
    background: v('--color-loss'),
  },
  '& [data-who]': { display: 'flex', flex: '1', flexDirection: 'column', gap: '2px', minWidth: 0 },
  '& [data-who] b': { fontSize: v('--text-sm') },
  '& [data-who] small': {
    fontSize: v('--text-2xs'),
    color: v('--color-text-secondary'),
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  '& [data-kind="sub"] [data-who] b': {
    fontWeight: v('--font-weight-semibold'),
    color: v('--color-text-secondary'),
  },
  '& [data-score]': {
    fontSize: v('--text-sm'),
    fontWeight: v('--font-weight-extrabold'),
    fontVariantNumeric: 'tabular-nums',
  },
  '& button[data-break]': {
    justifyContent: 'space-between',
    minHeight: space(9),
    fontSize: v('--text-3xs'),
    fontWeight: v('--font-weight-bold'),
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: v('--color-text-tertiary'),
  },
  '& button[data-break] b': { fontSize: v('--text-2xs'), letterSpacing: 0, color: v('--color-text-secondary') },
});

const unavailableStyles = css({
  padding: `${space(4)}`,
  fontSize: v('--text-xs'),
  lineHeight: 1.5,
  color: v('--color-text-secondary'),
});

const problemStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space(3),
  padding: space(4),
  borderRadius: v('--radius-lg'),
  background: v('--card-fill'),
  fontSize: v('--text-sm'),
  ...reveal(1),
});

const retryStyles = css({
  fontSize: v('--text-sm'),
  fontWeight: v('--font-weight-bold'),
  color: v('--color-accent'),
});

const pendingStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(4),

  '@keyframes match-pending': {
    '0%, 100%': { opacity: 0.5 },
    '50%': { opacity: 1 },
  },
  '& i': {
    display: 'block',
    borderRadius: v('--radius-lg'),
    background: v('--color-well'),
    animation: `match-pending 1.4s ${ease} infinite`,
  },
  '& i:nth-child(1)': { height: space(28) },
  '& i:nth-child(2)': { height: space(48), animationDelay: '120ms' },
  '& i:nth-child(3)': { height: space(48), animationDelay: '240ms' },
});
