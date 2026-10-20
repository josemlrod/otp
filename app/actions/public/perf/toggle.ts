import { renderStats } from './renders.ts';

// Shows the perf HUD on Option+Shift+P (Alt+Shift+P), on five quick taps on
// any `[data-perf-toggle]` element (for the installed PWA, which has no URL
// bar or keyboard), or with `?perf=1` in the URL (`?perf=0` hides it). The
// choice sticks across reloads. The HUD module only loads once it's first shown.
const STORAGE_KEY = 'otp:perf';
const TAPS_TO_TOGGLE = 5;
// Taps further apart than this start the count over.
const TAP_GAP_MS = 400;

export function installPerfToggle() {
  let visible = readStored();
  let unmount: (() => void) | null = null;

  const param = new URL(location.href).searchParams.get('perf');
  if (param !== null) {
    visible = param !== '0';
    store(visible);
  }
  // Start counting now rather than once the HUD loads, so a reload with the
  // HUD open includes the hydration renders.
  renderStats.enabled = visible;

  async function sync() {
    if (!visible) {
      unmount?.();
      unmount = null;
      return;
    }
    if (unmount) return;

    const { mountPerfHud } = await import('./hud.ts');
    // The shortcut may have been pressed again while the module loaded.
    if (visible && !unmount) {
      unmount = mountPerfHud({
        onClose: () => {
          visible = false;
          store(false);
          void sync();
        },
      });
    }
  }

  function toggle() {
    visible = !visible;
    store(visible);
    void sync();
  }

  window.addEventListener('keydown', (event) => {
    // Match the physical key: on macOS, Option+Shift+P types "∏".
    if (!event.altKey || !event.shiftKey || event.code !== 'KeyP') return;
    event.preventDefault();
    toggle();
  });

  // pointerdown rather than click: iOS doesn't fire delegated clicks on
  // elements that aren't interactive.
  let taps = 0;
  let lastTapAt = 0;
  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    if (!(event.target as Element).closest?.('[data-perf-toggle]')) return;
    taps = event.timeStamp - lastTapAt > TAP_GAP_MS ? 1 : taps + 1;
    lastTapAt = event.timeStamp;
    if (taps === TAPS_TO_TOGGLE) {
      taps = 0;
      toggle();
    }
  });

  void sync();
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function store(visible: boolean) {
  try {
    if (visible) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private browsing); the toggle still works
    // for this page load.
  }
}
