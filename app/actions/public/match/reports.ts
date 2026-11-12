import { TypedEventTarget } from 'remix/component';

import { isFresh } from '../../../lib/freshness.ts';
import type { MatchReport } from '../../../lib/match-report.ts';
import { routes } from '../../../routes.ts';

// Match reports the sheet has asked for, by match id. A finished match doesn't change, so one
// copy is kept for the session and refetched only once it's as stale as the server's cache.

export type ReportEntry =
  | { status: 'loading' }
  | { status: 'ready'; report: MatchReport }
  | { status: 'error' };

export class ReportChange extends Event {
  constructor(readonly matchId: number) {
    super('change');
  }
}

type Options = { fetch?: typeof fetch; now?: () => number };

export class MatchReportsModel extends TypedEventTarget<{ change: ReportChange }> {
  #entries = new Map<number, ReportEntry>();
  #fetch: typeof fetch;
  #now: () => number;

  constructor(options: Options = {}) {
    super();
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
  }

  get(matchId: number) {
    return this.#entries.get(matchId);
  }

  load(clubId: number, matchId: number) {
    const entry = this.#entries.get(matchId);
    if (entry?.status === 'loading') return;
    if (entry?.status === 'ready' && isFresh(entry.report.fetchedAt, this.#now())) return;

    const previous = entry?.status === 'ready' ? entry : undefined;
    if (!previous) this.#set(matchId, { status: 'loading' });
    this.#request(clubId, matchId).then(
      (report) => this.#set(matchId, { status: 'ready', report }),
      () => this.#set(matchId, previous ?? { status: 'error' }),
    );
  }

  async #request(clubId: number, matchId: number): Promise<MatchReport> {
    const res = await this.#fetch(routes.matchReport.href({ clubId, matchId }));
    if (!res.ok) throw new Error(`Match ${matchId} failed: ${res.status}`);
    return res.json();
  }

  #set(matchId: number, entry: ReportEntry) {
    this.#entries.set(matchId, entry);
    this.dispatchEvent(new ReportChange(matchId));
  }
}
