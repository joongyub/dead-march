import Phaser from 'phaser';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Notch / home-indicator insets converted from CSS pixels into game units. */
export function getSafeInsets(scale: Phaser.Scale.ScaleManager): Insets {
  const probe = document.getElementById('safe-area-probe');
  const canvasCssHeight = scale.canvas?.getBoundingClientRect().height || window.innerHeight;
  const ratio = scale.height / canvasCssHeight;
  if (!probe) return { top: 0, bottom: 0, left: 0, right: 0 };

  const style = getComputedStyle(probe);
  const read = (value: string) => (Number.parseFloat(value) || 0) * ratio;
  return {
    top: read(style.top),
    bottom: read(style.bottom),
    left: read(style.left),
    right: read(style.right),
  };
}
