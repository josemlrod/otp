import { TypedEventTarget } from 'remix/component';
import { isFresh } from '../../../lib/freshness.ts';
import type { ClubMatches } from '../../../lib/club-matches.ts';
import { routes } from '../../../routes.ts';

export type MatchesEntry =
  | { status: 'loading'; matches?: ClubMatches }
  | { status: 'ready'; matches: ClubMatches }
  | { status: 'error' };

type Options = {
  fetch?: typeof fetch;
  now?: () => number;
};

export class MatchesChange extends Event {
  constructor(readonly clubId: number) {
    super('change');
  }
}

export class MatchesModel extends TypedEventTarget<{ change: MatchesChange }> {
  #entries = new Map<number, MatchesEntry>();
  #fetch: typeof fetch;
  #now: () => number;

  constructor(seed: ClubMatches[] = [], options: Options = {}) {
    super();
    this.#fetch = options?.fetch ?? globalThis.fetch.bind(globalThis);
    this.#now = options?.now ?? Date.now;
    for (const matches of seed)
      this.#entries.set(matches.clubId, { status: 'ready', matches });
  }

  get(clubId: number) {
    return this.#entries.get(clubId);
  }

  load(clubId: number) {
    const entry = this.#entries.get(clubId);

    if (entry) {
      if (entry?.status === 'loading') return;

      const isNotStale =
        entry?.status === 'ready' &&
        isFresh(entry.matches.fetchedAt, this.#now());
      if (isNotStale) return;
    }

    const previous = entry?.status === 'ready' ? entry.matches : undefined;
    this.#set(clubId, { status: 'loading', matches: previous });

    this.#request(clubId).then(
      (matches) => this.#set(clubId, { status: 'ready', matches }),
      () =>
        this.#set(
          clubId,
          previous ? { status: 'ready', matches: previous } : { status: 'error' },
        ),
    );
  }

  async #request(clubId: number): Promise<ClubMatches> {
    const res = await this.#fetch(routes.clubMatches.href({ clubId }));
    if (!res.ok) throw new Error(`Matches for ${clubId} failed: ${res.status}`);
    return res.json();
  }

  #set(clubId: number, entry: MatchesEntry) {
    this.#entries.set(clubId, entry);
    this.dispatchEvent(new MatchesChange(clubId));
  }
}
