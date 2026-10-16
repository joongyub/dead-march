import { save } from '../game/save';

/**
 * Short vibrations for hits and big moments. Android browsers support navigator.vibrate; iPhone Safari
 * ignores it. The Android app (stage 9) can swap in native haptics here.
 */
let impl: (ms: number) => void = (ms) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
};
let lastAt = 0;

export function setHapticsImpl(next: (ms: number) => void): void {
  impl = next;
}

/** Vibrates for `ms` milliseconds unless turned off in settings; at most every 80 ms. */
export function vibrate(ms: number): void {
  if (!save.data.settings.vibration) return;
  const now = performance.now();
  if (now - lastAt < 80) return;
  lastAt = now;
  impl(ms);
}
