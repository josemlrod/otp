import { TypedEventTarget } from 'remix/component';
import { routes } from '../../../routes.ts';

const MAX_AGE = 60 * 60 * 1000;

type Team = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
};

type TeamCard = {
  teamId: number;
  fetchedAt: number;
  form: Array<{
    // last 5 FINISHED
    result: 'W' | 'D' | 'L';
    gf: number;
    ga: number;
    venue: 'H' | 'A';
    opponent: Team;
    competition: string;
  }>;
  fixtures: Array<{
    // upcoming, TIMED / SCHEDULED
    utcDate: string;
    venue: 'H' | 'A';
    opponent: Team;
    competition: string;
  }>;
};

type MatchesEntry =
  | { status: 'loading'; card?: TeamCard }
  | { status: 'ready'; card: TeamCard }
  | { status: 'error' };

type Options = {
  fetch?: typeof fetch;
  now?: () => number;
};

export class MatchesChange extends Event {
  constructor(readonly teamId: number) {
    super('change');
  }
}

export class MatchesModel extends TypedEventTarget<{ change: MatchesChange }> {
  #entries = new Map<number, MatchesEntry>();
  #fetch: typeof fetch;
  #now: () => number;

  constructor(seed: TeamCard[] = [], options: Options = {}) {
    super();
    this.#fetch = options?.fetch ?? globalThis.fetch.bind(globalThis);
    this.#now = options?.now ?? Date.now;
    for (const card of seed)
      this.#entries.set(card.teamId, { status: 'ready', card });
  }

  get(teamId: number) {
    return this.#entries.get(teamId);
  }

  load(teamId: number) {
    const entry = this.#entries.get(teamId);

    if (entry) {
      if (entry?.status === 'loading') return;

      const isNotStale =
        entry?.status === 'ready' &&
        this.#now() - entry.card.fetchedAt < MAX_AGE;
      if (isNotStale) return;
    }

    const previous = entry?.status === 'ready' ? entry.card : undefined;
    this.#set(teamId, { status: 'loading', card: previous });

    this.#request(teamId).then(
      (card) => this.#set(teamId, { status: 'ready', card }),
      () =>
        this.#set(
          teamId,
          previous ? { status: 'ready', card: previous } : { status: 'error' },
        ),
    );
  }

  async #request(teamId: number) {
    const res = await this.#fetch(routes.teamMatches.href({ teamId }));
    console.log('res', res);
    if (!res.ok) throw new Error(`Matches for ${teamId} failed: ${res.status}`);
    return res.json();
  }

  #set(teamId: number, entry: MatchesEntry) {
    this.#entries.set(teamId, entry);
    this.dispatchEvent(new MatchesChange(teamId));
  }
}
