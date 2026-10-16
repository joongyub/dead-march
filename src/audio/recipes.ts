/**
 * Every sound in the game is synthesized once at startup with an OfflineAudioContext: nothing to download,
 * no license to track, and each effect is a few lines that can be tuned by ear.
 */
export type SoundId =
  | 'shot'
  | 'shotHeavy'
  | 'cannon'
  | 'zombieDie'
  | 'explode'
  | 'gateGood'
  | 'gateBad'
  | 'merge'
  | 'smash'
  | 'clash'
  | 'bossRoar'
  | 'bossHit'
  | 'win'
  | 'lose'
  | 'click'
  | 'coin'
  | 'upgrade';

export type MusicId = 'battle' | 'lobby';

type Ctx = OfflineAudioContext;

const RATE = 22050;

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x3fffffff) - 1;
  }
  return buffer;
}

/** Gain node with a fast attack and exponential decay. */
function env(ctx: Ctx, at: number, peak: number, decay: number, attack = 0.004): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

function tone(
  ctx: Ctx,
  out: AudioNode,
  type: OscillatorType,
  at: number,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
  const g = env(ctx, at, peak, dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  dur: number,
  peak: number,
  filter: BiquadFilterType,
  f0: number,
  f1 = f0,
  q = 0.8,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  const g = env(ctx, at, peak, dur);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/** Musical note frequency, A4 = 440. */
function note(semitonesFromA4: number): number {
  return 440 * 2 ** (semitonesFromA4 / 12);
}

interface Recipe {
  seconds: number;
  build: (ctx: Ctx, out: AudioNode) => void;
}

export const SOUND_RECIPES: Record<SoundId, Recipe> = {
  shot: {
    seconds: 0.09,
    build: (c, o) => {
      noise(c, o, 0, 0.06, 0.5, 'bandpass', 2600, 1200, 0.9);
      tone(c, o, 'square', 0, 900, 180, 0.03, 0.12);
    },
  },
  shotHeavy: {
    seconds: 0.14,
    build: (c, o) => {
      noise(c, o, 0, 0.1, 0.7, 'lowpass', 2200, 600);
      tone(c, o, 'square', 0, 220, 60, 0.08, 0.25);
    },
  },
  cannon: {
    seconds: 0.45,
    build: (c, o) => {
      noise(c, o, 0, 0.35, 0.9, 'lowpass', 1400, 120);
      tone(c, o, 'sine', 0, 140, 32, 0.35, 0.9);
    },
  },
  zombieDie: {
    seconds: 0.22,
    build: (c, o) => {
      noise(c, o, 0, 0.16, 0.45, 'bandpass', 1300, 260, 2);
      tone(c, o, 'sawtooth', 0, 210, 80, 0.14, 0.12);
    },
  },
  explode: {
    seconds: 0.7,
    build: (c, o) => {
      noise(c, o, 0, 0.6, 1, 'lowpass', 3200, 140);
      tone(c, o, 'sine', 0, 90, 28, 0.55, 0.9);
    },
  },
  gateGood: {
    seconds: 0.45,
    build: (c, o) => {
      [3, 7, 10, 15].forEach((n, i) => tone(c, o, 'triangle', i * 0.055, note(n + 12), note(n + 12), 0.22, 0.35));
      tone(c, o, 'sine', 0.2, note(27), note(27), 0.25, 0.12);
    },
  },
  gateBad: {
    seconds: 0.4,
    build: (c, o) => {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      f.connect(o);
      tone(c, f, 'square', 0, 330, 110, 0.32, 0.35);
      tone(c, f, 'square', 0.02, 310, 100, 0.3, 0.25);
    },
  },
  merge: {
    seconds: 0.6,
    build: (c, o) => {
      tone(c, o, 'triangle', 0, 420, 1700, 0.18, 0.4);
      [24, 28, 31].forEach((n, i) => tone(c, o, 'sine', 0.12 + i * 0.05, note(n), note(n), 0.4, 0.28));
      noise(c, o, 0.1, 0.3, 0.12, 'highpass', 6000, 9000);
    },
  },
  smash: {
    seconds: 0.6,
    build: (c, o) => {
      noise(c, o, 0, 0.5, 1, 'lowpass', 4000, 300);
      for (let i = 0; i < 4; i++) noise(c, o, i * 0.04, 0.05, 0.6, 'bandpass', 900 + i * 300, 700, 3);
      tone(c, o, 'sine', 0, 70, 35, 0.4, 0.8);
    },
  },
  clash: {
    seconds: 0.25,
    build: (c, o) => {
      tone(c, o, 'sine', 0, 120, 40, 0.18, 0.9);
      noise(c, o, 0, 0.1, 0.6, 'lowpass', 1600, 300);
    },
  },
  bossRoar: {
    seconds: 1.4,
    build: (c, o) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, 0);
      osc.frequency.linearRampToValueAtTime(60, 1.2);
      const lfo = c.createOscillator();
      lfo.frequency.value = 9;
      const depth = c.createGain();
      depth.gain.value = 12;
      lfo.connect(depth).connect(osc.frequency);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(500, 0);
      f.frequency.linearRampToValueAtTime(900, 0.4);
      f.frequency.linearRampToValueAtTime(300, 1.2);
      const g = env(c, 0, 0.9, 1.15, 0.12);
      osc.connect(f).connect(g).connect(o);
      osc.start(0);
      lfo.start(0);
      osc.stop(1.35);
      lfo.stop(1.35);
      noise(c, o, 0, 1.1, 0.25, 'bandpass', 500, 200, 1.5);
    },
  },
  bossHit: {
    seconds: 0.15,
    build: (c, o) => {
      tone(c, o, 'sine', 0, 180, 60, 0.1, 0.6);
      noise(c, o, 0, 0.05, 0.3, 'lowpass', 1200, 400);
    },
  },
  win: {
    seconds: 1.6,
    build: (c, o) => {
      [-9, -5, -2, 3].forEach((n, i) => tone(c, o, 'triangle', i * 0.13, note(n), note(n), 0.25, 0.4));
      for (const n of [3, 7, 10]) tone(c, o, 'triangle', 0.55, note(n), note(n), 0.9, 0.25);
      tone(c, o, 'sine', 0.55, note(-21), note(-21), 0.9, 0.4);
    },
  },
  lose: {
    seconds: 1.6,
    build: (c, o) => {
      [-2, -6, -9, -14].forEach((n, i) => tone(c, o, 'sawtooth', i * 0.22, note(n), note(n - 0.3), 0.32, 0.18));
      tone(c, o, 'sine', 0.2, note(-33), note(-36), 1.2, 0.5);
    },
  },
  click: {
    seconds: 0.05,
    build: (c, o) => tone(c, o, 'sine', 0, 1400, 900, 0.03, 0.3),
  },
  coin: {
    seconds: 0.3,
    build: (c, o) => {
      tone(c, o, 'square', 0, note(14), note(14), 0.07, 0.18);
      tone(c, o, 'square', 0.07, note(19), note(19), 0.2, 0.18);
    },
  },
  upgrade: {
    seconds: 0.7,
    build: (c, o) => {
      [0, 4, 7, 12, 16].forEach((n, i) => tone(c, o, 'triangle', i * 0.06, note(n + 3), note(n + 3), 0.3, 0.3));
      noise(c, o, 0.2, 0.35, 0.1, 'highpass', 5000, 9000);
    },
  },
};

const BPM = 112;
const BEAT = 60 / BPM;

export const MUSIC_RECIPES: Record<MusicId, Recipe> = {
  // Two bars of driving drums and a minor bass line, looped.
  battle: {
    seconds: BEAT * 16,
    build: (c, o) => {
      const bass = [-29, -29, -26, -29, -24, -24, -22, -26]; // E1-ish minor line
      for (let b = 0; b < 16; b++) {
        const t = b * BEAT;
        if (b % 2 === 0) tone(c, o, 'sine', t, 110, 40, 0.28, 0.9); // kick
        if (b % 4 === 2) noise(c, o, t, 0.16, 0.35, 'bandpass', 1800, 1200, 0.7); // snare
        noise(c, o, t, 0.03, 0.12, 'highpass', 7000, 7000); // hat
        noise(c, o, t + BEAT / 2, 0.03, 0.08, 'highpass', 7000, 7000);
        const n = bass[Math.floor(b / 2) % bass.length];
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        f.connect(o);
        tone(c, f, 'sawtooth', t, note(n + 12), note(n + 12), BEAT * 0.9, 0.22);
      }
      // A tense stab every bar.
      for (const bar of [0, 8]) {
        for (const n of [-17, -14, -10]) tone(c, o, 'square', bar * BEAT + BEAT * 3.5, note(n), note(n), 0.25, 0.04);
      }
    },
  },
  // Slow minor pad for the lobby and the shelter.
  lobby: {
    seconds: 16,
    build: (c, o) => {
      const chords = [
        [-17, -10, -5],
        [-21, -14, -9],
        [-19, -12, -7],
        [-17, -10, -5],
      ];
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      f.connect(o);
      chords.forEach((chord, i) => {
        for (const n of chord) {
          for (const detune of [-4, 4]) {
            const osc = c.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = note(n);
            osc.detune.value = detune;
            const g = c.createGain();
            const t = i * 4;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.035, t + 1.2);
            g.gain.linearRampToValueAtTime(0.03, t + 3.2);
            g.gain.linearRampToValueAtTime(0.0001, t + 4.3);
            osc.connect(g).connect(f);
            osc.start(t);
            osc.stop(t + 4.4);
          }
        }
      });
    },
  },
};

export async function renderRecipe(recipe: Recipe, channels = 1): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(channels, Math.ceil(recipe.seconds * RATE), RATE);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  recipe.build(ctx, master);
  return ctx.startRendering();
}
