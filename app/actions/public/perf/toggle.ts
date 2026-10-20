import { renderStats } from './renders.ts';

const STORAGE_KEY = 'otp:perf';
const TAPS_TO_TOGGLE = 5;
const MAX_GAP_BETWEEN_TAPS_MS = 400;

export function installPerfToggle() {
  let visible = readStored();
  let unmount: (() => void) | null = null;

  const param = new URL(location.href).searchParams.get('perf');
  if (param !== null) {
    visible = param !== '0';
    store(visible);
  }
  renderStats.enabled = visible;

  async function sync() {
    if (!visible) {
      unmount?.();
      unmount = null;
      return;
    }
    if (unmount) return;

    const { mountPerfHud } = await import('./hud.ts');
    const stillWantedAfterLoading = visible && !unmount;
    if (stillWantedAfterLoading) {
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
    const isOptionShiftPhysicalP = event.altKey && event.shiftKey && event.code === 'KeyP';
    if (!isOptionShiftPhysicalP) return;
    event.preventDefault();
    toggle();
  });

  let taps = 0;
  let lastTapAt = 0;
  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    if (!(event.target as Element).closest?.('[data-perf-toggle]')) return;
    taps = event.timeStamp - lastTapAt > MAX_GAP_BETWEEN_TAPS_MS ? 1 : taps + 1;
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
  } catch {}
}
