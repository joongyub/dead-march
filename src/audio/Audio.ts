import { MUSIC_RECIPES, renderRecipe, SOUND_RECIPES, type MusicId, type SoundId } from './recipes';

/** At most this many effects play at once; extra ones are dropped (the mix is already full). */
const MAX_VOICES = 8;
/** The same effect does not restart faster than this (ms), so a hundred gunshots stay a rattle. */
const MIN_GAP: Partial<Record<SoundId, number>> = {
  shot: 45,
  shotHeavy: 70,
  cannon: 120,
  zombieDie: 60,
  explode: 120,
  bossHit: 90,
  clash: 120,
};
const VOLUME: Partial<Record<SoundId, number>> = {
  shot: 0.35,
  shotHeavy: 0.45,
  zombieDie: 0.4,
  click: 0.5,
};
const MUSIC_VOLUME = 0.32;

/**
 * Game audio on the Web Audio API: synthesized effects and music loops, a voice limit, per-effect rate
 * limits, and a master switch from settings. The context is created on the first touch (browsers only
 * allow sound after a user gesture) and suspended while the app is in the background.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly sounds = new Map<SoundId, AudioBuffer>();
  private readonly music = new Map<MusicId, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private voices = 0;
  private musicSource: AudioBufferSourceNode | null = null;
  private currentMusic: MusicId | null = null;
  private wantedMusic: MusicId | null = null;
  private enabled = true;
  private loading: Promise<void> | null = null;

  /** Renders every sound in the background; safe to call more than once. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    if (typeof OfflineAudioContext === 'undefined') return Promise.resolve();
    this.loading = (async () => {
      for (const id of Object.keys(SOUND_RECIPES) as SoundId[]) {
        this.sounds.set(id, await renderRecipe(SOUND_RECIPES[id]));
      }
      for (const id of Object.keys(MUSIC_RECIPES) as MusicId[]) {
        this.music.set(id, await renderRecipe(MUSIC_RECIPES[id]));
      }
      if (this.wantedMusic) this.playMusic(this.wantedMusic);
    })().catch(() => {
      // Audio is optional: a device that cannot render it simply plays silently.
    });
    return this.loading;
  }

  /** Call from a touch/click handler: creates or resumes the audio context. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_VOLUME;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedMusic && !this.musicSource) this.playMusic(this.wantedMusic);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.ctx) return; // created on the next touch
    if (on) {
      void this.ctx.resume();
      if (this.wantedMusic) this.playMusic(this.wantedMusic);
    } else {
      this.stopMusicSource();
      void this.ctx.suspend();
    }
  }

  /** App went to the background / came back. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.enabled && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(id: SoundId, volume = 1, detune = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const buffer = this.sounds.get(id);
    if (!buffer) return;
    const now = ctx.currentTime * 1000;
    const gap = MIN_GAP[id] ?? 30;
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < gap) return;
    this.lastPlayed.set(id, now);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Slight random pitch so repeated effects do not sound mechanical.
    src.detune.value = detune + (Math.random() - 0.5) * 120;
    const g = ctx.createGain();
    g.gain.value = volume * (VOLUME[id] ?? 0.7);
    src.connect(g).connect(this.master!);
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
    src.start();
  }

  playMusic(id: MusicId): void {
    this.wantedMusic = id;
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (this.currentMusic === id && this.musicSource) return;
    const buffer = this.music.get(id);
    if (!buffer) return;
    this.stopMusicSource();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.musicGain!);
    src.start();
    this.musicSource = src;
    this.currentMusic = id;
  }

  stopMusic(): void {
    this.wantedMusic = null;
    this.stopMusicSource();
  }

  private stopMusicSource(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // already stopped
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    this.currentMusic = null;
  }
}

export const audio = new AudioEngine();
