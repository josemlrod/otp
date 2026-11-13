import { routes } from '../../../routes.ts';

/** Asks the server which deploy it runs. Resolves null when offline or on a bad answer. */
export type FetchVersion = () => Promise<string | null>;

export const fetchServerVersion: FetchVersion = async () => {
  try {
    const response = await fetch(routes.version.href(), { cache: 'no-store' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const version = (body as { version?: unknown } | null)?.version;
    return typeof version === 'string' && version !== '' ? version : null;
  } catch {
    return null;
  }
};

type Options = {
  /** The deploy this page was rendered by. */
  current: string;
  fetchVersion?: FetchVersion;
  /** How often to ask while the page is in view. */
  interval?: number;
  /** Skip a check this soon after the last one, so resume events can't pile up. */
  minGap?: number;
  now?: () => number;
};

const FIVE_MINUTES = 5 * 60_000;
const TEN_SECONDS = 10_000;

/**
 * Notices when the server has moved on to a newer deploy than the one that rendered this page.
 *
 * An installed PWA can sit suspended for days and resume the same page, so it asks the server
 * when the app comes back into view, when the network returns, and every few minutes while
 * it's open. Fires 'update' each time a check finds a different deploy.
 */
export class VersionWatch extends EventTarget {
  readonly current: string;
  latest: string | null = null;
  #fetchVersion: FetchVersion;
  #interval: number;
  #minGap: number;
  #now: () => number;
  #lastCheck = -Infinity;
  #inFlight: Promise<boolean> | null = null;

  constructor({
    current,
    fetchVersion = fetchServerVersion,
    interval = FIVE_MINUTES,
    minGap = TEN_SECONDS,
    now = () => performance.now(),
  }: Options) {
    super();
    this.current = current;
    this.#fetchVersion = fetchVersion;
    this.#interval = interval;
    this.#minGap = minGap;
    this.#now = now;
  }

  get updateAvailable(): boolean {
    return this.latest !== null && this.latest !== this.current;
  }

  /** Resolves whether a newer deploy is live. */
  check(): Promise<boolean> {
    if (this.#inFlight) return this.#inFlight;
    if (this.#now() - this.#lastCheck < this.#minGap) return Promise.resolve(this.updateAvailable);
    this.#lastCheck = this.#now();
    this.#inFlight = this.#fetchVersion()
      .then((version) => {
        if (version !== null) this.latest = version;
        if (this.updateAvailable) this.dispatchEvent(new Event('update'));
        return this.updateAvailable;
      })
      .finally(() => {
        this.#inFlight = null;
      });
    return this.#inFlight;
  }

  /** Checks now, then on resume, on reconnect and on a timer until the signal aborts. */
  start(signal: AbortSignal) {
    const checkIfVisible = () => {
      if (document.visibilityState === 'visible') void this.check();
    };
    document.addEventListener('visibilitychange', checkIfVisible, { signal });
    // A page restored from the back/forward cache never re-ran its scripts.
    window.addEventListener('pageshow', (event) => event.persisted && void this.check(), { signal });
    window.addEventListener('online', checkIfVisible, { signal });
    // Once an update is known, resume checks alone are enough to bring a dismissed prompt back.
    const timer = setInterval(() => this.updateAvailable || checkIfVisible(), this.#interval);
    signal.addEventListener('abort', () => clearInterval(timer), { once: true });
    checkIfVisible();
  }
}
