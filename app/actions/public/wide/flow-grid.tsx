import { css, ref, type Handle, type RemixNode } from 'remix/component';

import { space } from '../../../ui/theme.ts';
import { countRender } from '../perf/renders.ts';
import { choosePlan, measureBlocks, morphBlocks, type Plan } from './flow.ts';

type Props = {
  plans: readonly Plan[];
  /** Blocks by id. A missing or empty block is left out of every column. */
  blocks: Record<string, RemixNode>;
};

// Lays a page's blocks into the columns of the plan that fits the grid's width, and morphs the
// blocks to their new places when the width crosses into another plan.
export function FlowGrid(handle: Handle<Props>) {
  let index = -1;
  let grid: HTMLElement | undefined;

  function refit() {
    if (!grid) return;
    const next = choosePlan(grid.clientWidth, handle.props.plans, index);
    if (next === index) return;
    const first = index < 0 ? null : measureBlocks(grid);
    index = next;
    handle.update().then((signal) => {
      if (!signal.aborted && first && grid) morphBlocks(grid, first);
    });
  }

  return () => {
    countRender('FlowGrid');
    const { plans, blocks } = handle.props;
    const plan = plans[Math.max(0, index)]!;

    return (
      <div
        data-cols={index < 0 ? undefined : plan.cols.length}
        mix={[
          gridStyles,
          ref((node, signal) => {
            grid = node;
            // Re-plan on the next frame: re-rendering inside the observer would resize the page
            // around the grid mid-delivery.
            let frame = 0;
            const observer = new ResizeObserver(() => {
              if (!frame) frame = requestAnimationFrame(() => ((frame = 0), refit()));
            });
            observer.observe(node);
            signal.addEventListener('abort', () => (cancelAnimationFrame(frame), observer.disconnect()));
          }),
        ]}
        style={{
          gridTemplateColumns: plan.template ?? `repeat(${plan.cols.length}, minmax(0, 1fr))`,
          // Hidden until the first measurement, so the page never flashes the one-column plan.
          visibility: index < 0 ? 'hidden' : undefined,
        }}
      >
        {plan.cols.map((ids, column) => (
          <div key={column} mix={columnStyles}>
            {ids
              .filter((id) => blocks[id])
              .map((id) => (
                <section key={id} data-block={id} mix={blockStyles}>
                  {blocks[id]}
                </section>
              ))}
          </div>
        ))}
      </div>
    );
  };
}

const gridStyles = css({
  display: 'grid',
  gap: space(5),
  alignItems: 'start',
});

const columnStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: space(5),
  minWidth: 0,
});

const blockStyles = css({
  containerType: 'inline-size',
  display: 'flex',
  flexDirection: 'column',
  gap: space(2.5),
  minWidth: 0,
});
