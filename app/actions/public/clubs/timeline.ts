import {
  SPRING,
  Value,
  blockScrollWhile,
  clamp,
  lerp,
  rubber,
  tracker,
  type Spring,
  type Tracker,
} from '../motion.ts';

// One club card's timeline. The form strip runs from the past to a NEXT slot, and the block below
// is one pager over the same timeline (results, then fixtures), so strip and block always agree.
// Whatever the strip lands on stays picked. Scrub to Next, or swipe the block, to come back.
//
// DOM hooks (rendered by club-card.tsx):
//   [data-club-card]  card root; gets data-picked, data-scrubbing, data-future, data-now
//   [data-form]       the scrub target, holding [data-lens] and [data-pills] > [data-pill]
//   [data-pager]      viewport, holding [data-track] > one child per page
//   [data-dot]        one per fixture

const SCRUB_DELAY = 110;
const LENS_PAD = 8;

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode) =>
  root.querySelector<T & HTMLElement>(selector)!;
const $$ = (selector: string, root: ParentNode) => [...root.querySelectorAll<HTMLElement>(selector)];

type SelectOptions = {
  animate?: boolean;
  silent?: boolean;
  moveLens?: boolean;
  velocity?: number;
  spring?: Spring;
};

type Slot = { c: number; w: number };

// ───────── form scrubber ─────────
// A lens follows the finger 1:1 across the pills. Whatever it lands on stays picked.

function scrubber(card: HTMLElement, signal: AbortSignal, { onChange }: { onChange: (i: number) => void }) {
  const form = $('[data-form]', card);
  const list = $('[data-pills]', form);
  const slots = $$('[data-pill]', form);
  const lens = $('[data-lens]', form);

  let selected = -1;
  let gesture: {
    id: number;
    x0: number;
    y0: number;
    x: number;
    active: boolean;
    velocity: Tracker;
    timer: ReturnType<typeof setTimeout>;
    g: Slot[];
  } | null = null;

  let lensX: Value | undefined;
  let lensW: Value | undefined;
  const render = () => {
    if (!lensX || !lensW) return;
    lens.style.width = `${lensW.value}px`;
    lens.style.transform = `translate3d(${lensX.value - lensW.value / 2}px, 0, 0)`;
  };
  lensX = new Value(0, render);
  lensW = new Value(28, render);

  // offset* ignores transforms, so a lit pill's scale never shifts the geometry.
  // Cached: follow() runs every frame while the block is swiped.
  let cache: Slot[] | null = null;
  const geometry = () =>
    (cache ??= slots.map((slot) => ({
      c: list.offsetLeft + slot.offsetLeft + slot.offsetWidth / 2,
      w: slot.offsetWidth + LENS_PAD,
    })));
  window.addEventListener('resize', () => (cache = null), { signal });

  const setLit = (i: number) => {
    slots.forEach((slot, j) => slot.toggleAttribute('data-lit', j === i));
    card.toggleAttribute('data-picked', i >= 0);
  };

  function select(i: number, { animate = true, silent = false, moveLens = true, velocity = 0, spring = SPRING.settle }: SelectOptions = {}) {
    const was = selected;
    selected = i;
    setLit(i);
    if (i >= 0 && moveLens) {
      const g = geometry()[i]!;
      if (was < 0 || !animate) {
        lensX!.set(g.c);
        lensW!.set(g.w);
      } else {
        lensX!.to(g.c, { velocity, spring });
        lensW!.to(g.w, { spring });
      }
    }
    if (!silent) onChange(i);
  }

  // Lets the pager drive the lens by a fractional slot position.
  function follow(position: number) {
    if (gesture?.active || lensX!.animating) return;
    const g = geometry();
    const a = clamp(Math.floor(position), 0, g.length - 1);
    const b = clamp(a + 1, 0, g.length - 1);
    const t = clamp(position - a, 0, 1);
    lensX!.set(lerp(g[a]!.c, g[b]!.c, t));
    lensW!.set(lerp(g[a]!.w, g[b]!.w, t));
  }

  const nearest = (x: number, g: Slot[]) =>
    g.reduce((best, slot, i) => (Math.abs(slot.c - x) < Math.abs(g[best]!.c - x) ? i : best), 0);
  const localX = (clientX: number) => clientX - form.getBoundingClientRect().left;

  function track(clientX: number) {
    const g = gesture!.g;
    const x = localX(clientX);
    const first = g[0]!.c;
    const last = g[g.length - 1]!.c;
    lensX!.set(x < first ? first + rubber(x - first, 60) : x > last ? last + rubber(x - last, 60) : x);
    const i = nearest(x, g);
    if (lensW!.target !== g[i]!.w) lensW!.to(g[i]!.w, { spring: SPRING.snap });
    if (i !== selected) {
      selected = i;
      setLit(i);
      onChange(i);
    }
  }

  function activate() {
    if (!gesture) return;
    gesture.active = true;
    gesture.g = geometry();
    clearTimeout(gesture.timer);
    try {
      form.setPointerCapture(gesture.id);
    } catch {}
    card.setAttribute('data-scrubbing', '');
    track(gesture.x);
  }

  const cancel = () => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    clearTimeout(g.timer);
    card.removeAttribute('data-scrubbing');
    if (g.active && selected >= 0) select(selected, { silent: true });
  };

  form.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const velocity = tracker();
    velocity.reset(e.clientX, e.clientY, e.timeStamp);
    gesture = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      active: false,
      velocity,
      g: [],
      timer: setTimeout(() => gesture && !gesture.active && activate(), SCRUB_DELAY),
    };
  }, { signal });

  form.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture.x = e.clientX;
    gesture.velocity.add(e.clientX, e.clientY, e.timeStamp);
    if (!gesture.active) {
      const dx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) return cancel();
      if (Math.abs(dx) < 4) return;
      activate();
      return;
    }
    track(e.clientX);
  }, { signal });

  form.addEventListener('pointerup', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    clearTimeout(g.timer);
    card.removeAttribute('data-scrubbing');

    if (g.active) {
      // Land on the picked pill, carrying the finger's speed, and stay there.
      const slot = g.g[selected]!;
      lensX!.to(slot.c, { velocity: g.velocity.velocity(e.timeStamp).x, spring: SPRING.release });
      lensW!.to(slot.w, { spring: SPRING.release });
      onChange(selected);
      return;
    }

    const i = nearest(localX(g.x), geometry());
    if (i !== selected) select(i);
  }, { signal });

  form.addEventListener('pointercancel', cancel, { signal });
  blockScrollWhile(form, () => !!gesture?.active, signal);
  signal.addEventListener('abort', () => {
    lensX!.stop();
    lensW!.stop();
  });

  return {
    select,
    follow,
    get selected() {
      return selected;
    },
  };
}

// ───────── pager ─────────
// Tracks 1:1, rubber-bands at the ends, lands with the fling. One page per release.

function pager(
  card: HTMLElement,
  signal: AbortSignal,
  { initial, onIndex, onMove }: { initial: number; onIndex: (i: number) => void; onMove: (position: number) => void },
) {
  const viewport = $('[data-pager]', card);
  const trackEl = $('[data-track]', viewport);
  const pages = [...trackEl.children] as HTMLElement[];
  const count = pages.length;
  let index = initial;
  const width = () => viewport.clientWidth;
  let suppressClick = false;

  const x = new Value(-initial * width(), (v) => {
    trackEl.style.transform = `translate3d(${v}px, 0, 0)`;
    const w = width();
    if (w) onMove(-v / w);
  });

  const mark = (i: number) => pages.forEach((page, j) => (page.inert = j !== i));
  mark(index);

  function go(i: number, { spring = SPRING.settle, velocity }: { spring?: Spring; velocity?: number } = {}) {
    index = clamp(i, 0, count - 1);
    mark(index);
    return x.to(-index * width(), { spring, velocity });
  }

  let gesture: { id: number; x0: number; y0: number; start: number; claimed: boolean; velocity: Tracker } | null = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || card.hasAttribute('data-scrubbing')) return;
    const caught = x.animating;
    x.stop();
    const velocity = tracker();
    velocity.reset(e.clientX, e.clientY, e.timeStamp);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: x.value, claimed: caught, velocity };
    if (caught) viewport.setPointerCapture(e.pointerId);
  }, { signal });

  viewport.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture.velocity.add(e.clientX, e.clientY, e.timeStamp);
    let dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (!gesture.claimed) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      gesture.claimed = true;
      gesture.x0 = e.clientX;
      dx = 0;
      viewport.setPointerCapture(e.pointerId);
    }
    const w = width();
    const min = -(count - 1) * w;
    const raw = gesture.start + dx;
    x.set(raw > 0 ? rubber(raw, w) : raw < min ? min + rubber(raw - min, w) : raw);
  }, { signal });

  const onUp = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const { claimed } = gesture;
    const velocity = e.type === 'pointerup' ? gesture.velocity.velocity(e.timeStamp).x : 0;
    gesture = null;
    if (!claimed) {
      // Caught mid-flight and let go without moving: finish where it was heading.
      if (x.value !== -index * width()) go(index, { spring: SPRING.snap });
      return;
    }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const w = width();
    const from = Math.round(-x.value / w);
    const target = clamp(Math.round(-(x.value + velocity * 0.2) / w), Math.max(0, from - 1), Math.min(count - 1, from + 1));
    index = target;
    mark(target);
    onIndex(target);
    x.to(-target * w, { velocity, spring: SPRING.release });
  };
  viewport.addEventListener('pointerup', onUp, { signal });
  viewport.addEventListener('pointercancel', onUp, { signal });

  viewport.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true, signal });

  window.addEventListener('resize', () => x.set(-index * width()), { signal });
  blockScrollWhile(viewport, () => !!gesture?.claimed, signal);
  signal.addEventListener('abort', () => x.stop());

  return {
    go,
    get index() {
      return index;
    },
  };
}

// ───────── the two, linked ─────────

export function wireTimeline(card: HTMLElement, signal: AbortSignal) {
  const NOW = $$('[data-pill]', card).length - 1; // the last slot is NEXT
  const toSlot = (page: number) => Math.min(page, NOW);
  const dots = $$('[data-dot]', card);
  const mark = (page: number) => {
    card.toggleAttribute('data-future', page >= NOW);
    card.toggleAttribute('data-now', page === NOW);
    dots.forEach((dot, j) => dot.toggleAttribute('data-on', j === page - NOW));
  };

  let scrub: ReturnType<typeof scrubber> | null = null;
  const pages = pager(card, signal, {
    initial: NOW,
    onIndex(page) {
      mark(page);
      scrub!.select(toSlot(page), { silent: true, moveLens: false });
    },
    onMove: (position) => scrub?.follow(Math.min(position, NOW)),
  });
  scrub = scrubber(card, signal, {
    onChange(i) {
      const page = i >= NOW ? Math.max(NOW, pages.index) : i;
      mark(page);
      pages.go(page);
    },
  });
  scrub.select(NOW, { silent: true, animate: false });
  mark(NOW);
}
