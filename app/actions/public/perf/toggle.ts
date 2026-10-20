import { renderStats } from './renders.ts';

// Shows the perf HUD on Option+Shift+P (Alt+Shift+P), or with `?perf=1` in the
// URL on devices without a keyboard (`?perf=0` hides it). The choice sticks
// across reloads. The HUD module only loads once it's first shown.
const STORAGE_KEY = 'otp:perf';

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

  window.addEventListener('keydown', (event) => {
    // Match the physical key: on macOS, Option+Shift+P types "∏".
    if (!event.altKey || !event.shiftKey || event.code !== 'KeyP') return;
    event.preventDefault();
    visible = !visible;
    store(visible);
    void sync();
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
