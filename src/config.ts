/** Design resolution. Width is fixed; height grows with the screen (Scale.EXPAND). */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/**
 * Canvas pixels per CSS pixel never exceed this. With a 720px-wide canvas, phones
 * (360–430 CSS px wide) land at roughly 1.7–2.0, so the cap mostly holds by itself;
 * main.ts enforces it for narrower screens.
 */
export const MAX_DPR = 2;

export const SceneKeys = {
  Boot: 'Boot',
  Preload: 'Preload',
  Lobby: 'Lobby',
  Battle: 'Battle',
  Pause: 'Pause',
  Result: 'Result',
  Settings: 'Settings',
  Shelter: 'Shelter',
} as const;

export const TextureKeys = {
  Pixel: 'px',
  Panel: 'panel',
} as const;

export const Colors = {
  background: 0x11140f,
  primary: 0x3fa34d,
  primaryDark: 0x2c7536,
  danger: 0xb8433a,
  neutral: 0x3a4250,
  text: '#e9efe4',
  textDim: '#93a08a',
  accent: '#f2c14e',
  good: 0x2e8bff,
  bad: 0xff3b3b,
  special: 0xffa726,
  zombieCount: 0xff6b6b,
  progress: 0x6fdc8c,
} as const;

export const FONT_FAMILY =
  'system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
