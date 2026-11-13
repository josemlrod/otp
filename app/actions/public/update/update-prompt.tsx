import { clientEntry, css, on, type Handle } from 'remix/component';

import { space, v } from '../../../ui/theme.ts';
import { VersionWatch } from './version-watch.ts';

type Props = {
  /** The deploy that rendered this page. */
  version: string;
};

/** Hydrates the prompt on every page. */
export const UpdatePrompt = clientEntry(
  import.meta.url,
  function UpdatePrompt(handle: Handle<Props>) {
    const watch = new VersionWatch({ current: handle.props.version });
    return () => <UpdatePill watch={watch} />;
  },
);

type PillProps = {
  watch: VersionWatch;
};

/**
 * Offers to reload once a newer deploy is live. "Later" hides it until the app next comes back
 * into view.
 */
export function UpdatePill(handle: Handle<PillProps>) {
  const { watch } = handle.props;
  let shown = false;
  let updating = false;

  watch.addEventListener(
    'update',
    () => {
      if (shown) return;
      shown = true;
      handle.update();
    },
    { signal: handle.signal },
  );
  handle.queueTask(() => watch.start(handle.signal));

  function later() {
    shown = false;
    handle.update();
  }

  function update() {
    updating = true;
    handle.update();
  }

  return () => (
    <div aria-live='polite' mix={regionStyles}>
      {shown && (
        <div data-update-prompt mix={pillStyles}>
          <p mix={labelStyles}>New version available</p>
          <button type='button' data-update-later mix={[laterStyles, on('click', later)]}>
            Later
          </button>
          {/*
            A full page load, so the new deploy's scripts run. The Remix runtime turns
            location.reload() into a re-render that keeps the old scripts; data-rmx-document
            hands this link to the browser instead. The page and its scripts revalidate on load.
          */}
          <a
            href={location.pathname + location.search}
            data-rmx-document
            data-update-now
            aria-disabled={updating ? 'true' : undefined}
            mix={[updateStyles, on('click', update)]}
          >
            {updating ? 'Updating…' : 'Update'}
          </a>
        </div>
      )}
    </div>
  );
}

const regionStyles = css({
  position: 'fixed',
  top: `calc(${v('--safe-area-inset-top')} + ${space(2)})`,
  left: `calc(${v('--safe-area-inset-left')} + ${v('--gutter')})`,
  right: `calc(${v('--safe-area-inset-right')} + ${v('--gutter')})`,
  zIndex: 100,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
});

const pillStyles = css({
  '@keyframes update-prompt-in': {
    from: { opacity: 0, transform: `translateY(calc(-100% - ${space(4)}))` },
  },

  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: space(1),
  maxWidth: '100%',
  padding: space(1),
  paddingLeft: space(4),
  borderRadius: v('--radius-full'),
  background: v('--color-surface-raised'),
  boxShadow: `${v('--shadow-highlight')}, ${v('--shadow-mark')}, ${v('--shadow-card')}`,
  animation: `update-prompt-in ${v('--duration-sheet-open')} ${v('--ease-ios')}`,
});

const labelStyles = css({
  flex: '1 1 auto',
  minWidth: 0,
  marginRight: space(1),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-semibold'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

const buttonStyles = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  height: space(8.5),
  padding: `0 ${space(3.5)}`,
  borderRadius: v('--radius-full'),
  fontSize: v('--text-xs'),
  fontWeight: v('--font-weight-bold'),
  transitionProperty: 'transform, opacity',
  transitionDuration: v('--duration-press'),
  transitionTimingFunction: v('--ease-out'),

  '&:active': {
    transform: 'scale(0.96)',
  },
} as const;

const laterStyles = css({
  ...buttonStyles,
  color: v('--color-text-secondary'),
});

const updateStyles = css({
  ...buttonStyles,
  background: v('--color-accent'),
  color: v('--color-accent-ink'),

  '&[aria-disabled]': {
    opacity: 0.7,
    pointerEvents: 'none',
  },
});
