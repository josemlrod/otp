// Column plans for the wide detail pane. A plan says, from a minimum grid width, which blocks
// sit in which column, so each column count is a designed layout rather than a wrap.

export type Plan = {
  min: number;
  cols: string[][];
  template?: string;
};

const HYSTERESIS_PX = 16;
const MORPH = '420ms cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * The plan for a grid width. Once a plan is showing, it steps up only when clearly past the next
 * threshold and down only when clearly below its own, so a width that hovers on a threshold
 * doesn't flip the layout back and forth. The first pick has no history and uses exact widths.
 */
export function choosePlan(width: number, plans: readonly Plan[], current: number) {
  const pad = current < 0 ? 0 : HYSTERESIS_PX;
  let index = Math.max(0, Math.min(current, plans.length - 1));
  while (index + 1 < plans.length && width >= plans[index + 1]!.min + (index + 1 > current ? pad : -pad)) index++;
  while (index > 0 && width < plans[index]!.min - (index <= current ? pad : -pad)) index--;
  return index;
}

export function measureBlocks(grid: HTMLElement) {
  return new Map(
    [...grid.querySelectorAll<HTMLElement>('[data-block]')].map((block) => [
      block.dataset.block!,
      block.getBoundingClientRect(),
    ]),
  );
}

// FLIP: each block starts where it was and glides to where the new plan put it. Rects are read
// with transforms applied, so a reflow that interrupts another starts from where blocks are now.
export function morphBlocks(grid: HTMLElement, first: Map<string, DOMRect>) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const moved: HTMLElement[] = [];
  for (const block of grid.querySelectorAll<HTMLElement>('[data-block]')) {
    const before = first.get(block.dataset.block!);
    if (!before) continue;
    const after = block.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    block.style.transition = 'none';
    block.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    moved.push(block);
  }
  if (!moved.length) return;
  grid.offsetWidth; // commit the inverted positions before playing
  for (const block of moved) {
    block.style.transition = `transform ${MORPH}`;
    block.style.transform = '';
  }
}
