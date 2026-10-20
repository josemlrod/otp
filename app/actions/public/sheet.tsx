import { clientEntry, css, on, ref } from 'remix/component';

export const Sheet = clientEntry(import.meta.url, function () {
  let sheet: HTMLElement | undefined;

  let y = 0;
  let detent: 'large' | 'closed' = 'closed';
  let detents = () => ({ large: 0, closed: (sheet?.offsetHeight ?? 0) + 30 });

  return () => (
    <section
      mix={[
        sheetContainer,
        ref<HTMLElement>((node) => {
          sheet = node;
          console.log(detents());
        }),
      ]}
      role='dialog'
      aria-modal={true}
      aria-hidden={true}
      inert={true}
    >
      <div mix={sheetGrab} data-grab>
        <span mix={sheetHandle}></span>
        <div class='ds-head'></div>
      </div>
      <div mix={sheetScroll}></div>
      <p>Hello</p>
      <button type='button' mix={on('click', () => window.alert('hi'))}>
        Alert
      </button>
    </section>
  );
});

const sheetContainer = css({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 'calc(var(--safe-top) + 10px)',
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: '18px 18px 0 0',
  background: 'var(--surface)',
  boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
  transform: 'translateY(110%)',
  transitionProperty: 'transform',
  transitionTimingFunction: 'var(--ease-ios)',
  touchAction: 'none',
  willChange: 'transform',
  '--surface-in': 'var(--surface-2)',
});

const sheetGrab = css({
  position: 'relative',
  flex: 'none',
  touchAction: 'none',
  cursor: 'grab',
});

const sheetHandle = css({
  position: 'absolute',
  top: 6,
  left: '50%',
  zIndex: 2,
  width: 36,
  height: 5,
  borderRadius: 3,
  background: 'rgba(255, 255, 255, 0.45)',
  transform: 'translateX(-50%)',
});

const sheetScroll = css({
  position: 'relative',
  flex: 1,
  overflow: 'hidden',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'none',
  paddingBottom: 'calc(var(--safe-bottom) + 24px)',
});
