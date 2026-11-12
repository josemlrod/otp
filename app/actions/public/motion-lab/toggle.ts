import { motionTime } from '../motion.ts';
import type { record } from './trace.ts';
import type { summarize } from './stats.ts';

declare global {
  interface Window {
    __otpMotion?: {
      setScale: typeof motionTime.setScale;
      step: () => void;
      record: typeof record;
      summarize: typeof summarize;
    };
  }
}
const KEY = 'otp:motion';

export function installMotionLabToggle() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {}
  const params = new URL(location.href).searchParams;
  const requested = params.get('motion') ?? saved;
  let visible = requested !== null && requested !== '0';
  let scale = Number(requested ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  let unmount: (() => void) | null = null;

  function store() {
    try {
      if (visible) localStorage.setItem(KEY, String(motionTime.scale || scale));
      else localStorage.removeItem(KEY);
    } catch {}
  }

  async function sync() {
    if (!visible) {
      unmount?.();
      unmount = null;
      delete window.__otpMotion;
      return;
    }
    if (unmount) return;
    const { mountMotionLab, record, summarize, stepAnimations } = await import('./lab.ts');
    if (!visible || unmount) return;
    motionTime.setScale(scale);
    unmount = mountMotionLab({
      panel: params.get('motionPanel') !== '0',
      onClose: () => {
        scale = motionTime.scale || scale;
        visible = false;
        store();
        void sync();
      },
    });
    const setScale = (value: number) => {
      motionTime.setScale(value);
      scale = value || scale;
      store();
    };
    window.__otpMotion = {
      setScale,
      step: () => {
        motionTime.step();
        stepAnimations();
      },
      record,
      summarize,
    };
    store();
  }

  // Panel controls use motionTime directly, so persist their rate changes too.
  window.addEventListener('pagehide', store);
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault();
      toggle();
    }
  });
  window.addEventListener('otp:motion-lab-toggle', toggle);

  function toggle() {
    if (visible) scale = motionTime.scale || scale;
    visible = !visible;
    store();
    void sync();
  }
  store();
  void sync();
}
