import { TypedEventTarget } from 'remix/component';

import type { ClubSection } from '../../../lib/clubs.ts';
import { yourClubsCookie } from '../../../lib/your-clubs-cookie.ts';
import { resolveYourClubs, type YourClubs } from '../../../lib/your-clubs.ts';

type Options = {
  save?: (ids: number[]) => void;
  load: (id: number) => void;
};

export class YourClubsModel extends TypedEventTarget<{ change: Event }> {
  #current: YourClubs;
  #sections: ClubSection[];
  #draft: number[];
  #save: (ids: number[]) => void;
  #load: (id: number) => void;

  constructor(current: YourClubs, sections: ClubSection[], options: Options) {
    super();
    this.#current = current;
    this.#sections = sections;
    this.#draft = current.clubs.map((club) => club.id);
    this.#save =
      options.save ??
      ((ids) => {
        document.cookie = yourClubsCookie(ids);
      });
    this.#load = options.load;
  }

  get current() {
    return this.#current;
  }

  beginEdit() {
    this.#draft = this.#current.clubs.map((club) => club.id);
  }

  setDraft(ids: number[]) {
    this.#draft = [...ids];
  }

  commit() {
    const previous = this.#current.clubs.map((club) => club.id);
    if (previous.join() === this.#draft.join()) return;
    this.#current = resolveYourClubs(
      [...this.#draft, ...this.#current.unresolvedIds],
      this.#sections,
      false,
    );
    this.#save([...this.#current.savedIds]);
    for (const club of this.#current.clubs) {
      if (!previous.includes(club.id)) this.#load(club.id);
    }
    this.dispatchEvent(new Event('change'));
  }
}
