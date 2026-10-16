import Phaser from 'phaser';

export interface PerfSnapshot {
  fps: number;
  frameMsAvg: number;
  frameMsMax: number;
  logicMsAvg: number;
  renderMsAvg: number;
  sprites: number;
  drawCalls: number;
  renderer: 'WebGL' | 'Canvas';
  canvas: string;
  dpr: number;
  heapMB: number | null;
}

export interface PerfSummary {
  frames: number;
  fpsAvg: number;
  frameMsAvg: number;
  frameMsP99: number;
  frameMsMax: number;
  logicMsAvg: number;
  renderMsAvg: number;
  drawCallsAvg: number;
}

const SNAPSHOT_INTERVAL_MS = 250;
const HISTORY = 1200;

type DrawFn = (...args: never[]) => void;

/**
 * Measures frame, logic and render time plus draw calls. Only constructed when ?debug=1,
 * so release builds pay nothing for it.
 *
 * Logic time = PRE_STEP → PRE_RENDER (all scene updates), render time = PRE_RENDER → POST_RENDER
 * (CPU side of drawing; GPU time is not visible from JavaScript).
 */
export class PerfMonitor {
  private latest: PerfSnapshot;

  private stepStart = 0;
  private renderStart = 0;
  private lastFrameAt = 0;
  private drawCallsThisFrame = 0;
  private frameValid = false;

  // Window accumulators for the on-screen snapshot.
  private winFrames = 0;
  private winFrameMs = 0;
  private winFrameMax = 0;
  private winLogicMs = 0;
  private winRenderMs = 0;
  private winDrawCalls = 0;
  private winStartedAt = performance.now();

  // Ring buffers for summary(), preallocated so measuring does not allocate per frame.
  private readonly frameHist = new Float32Array(HISTORY);
  private readonly logicHist = new Float32Array(HISTORY);
  private readonly renderHist = new Float32Array(HISTORY);
  private readonly drawHist = new Float32Array(HISTORY);
  private histCount = 0;
  private histIndex = 0;

  private readonly listeners: Array<(snapshot: PerfSnapshot) => void> = [];

  constructor(private readonly game: Phaser.Game) {
    this.latest = this.emptySnapshot();
    const events = game.events;
    events.on(Phaser.Core.Events.PRE_STEP, this.onPreStep, this);
    events.on(Phaser.Core.Events.PRE_RENDER, this.onPreRender, this);
    events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender, this);
    // After the tab comes back, the first frame interval includes the time spent hidden; skip it.
    events.on(Phaser.Core.Events.RESUME, this.onResume, this);
    this.wrapDrawCalls();
  }

  onSnapshot(listener: (snapshot: PerfSnapshot) => void): void {
    this.listeners.push(listener);
  }

  snapshot(): PerfSnapshot {
    return this.latest;
  }

  /** Starts a fresh measurement window for summary(). */
  reset(): void {
    this.histCount = 0;
    this.histIndex = 0;
    this.lastFrameAt = 0;
  }

  summary(): PerfSummary {
    const n = this.histCount;
    if (n === 0) {
      return { frames: 0, fpsAvg: 0, frameMsAvg: 0, frameMsP99: 0, frameMsMax: 0, logicMsAvg: 0, renderMsAvg: 0, drawCallsAvg: 0 };
    }
    const frames = Array.from(this.frameHist.subarray(0, n)).sort((a, b) => a - b);
    const sum = (arr: Float32Array) => {
      let total = 0;
      for (let i = 0; i < n; i++) total += arr[i];
      return total;
    };
    const frameAvg = sum(this.frameHist) / n;
    return {
      frames: n,
      fpsAvg: round(1000 / frameAvg, 1),
      frameMsAvg: round(frameAvg, 2),
      frameMsP99: round(frames[Math.min(n - 1, Math.floor(n * 0.99))], 2),
      frameMsMax: round(frames[n - 1], 2),
      logicMsAvg: round(sum(this.logicHist) / n, 3),
      renderMsAvg: round(sum(this.renderHist) / n, 3),
      drawCallsAvg: round(sum(this.drawHist) / n, 1),
    };
  }

  private onPreStep(): void {
    const now = performance.now();
    this.stepStart = now;
    this.frameValid = this.lastFrameAt > 0;
    if (this.frameValid) {
      const frameMs = now - this.lastFrameAt;
      this.winFrames++;
      this.winFrameMs += frameMs;
      if (frameMs > this.winFrameMax) this.winFrameMax = frameMs;
      this.frameHist[this.histIndex] = frameMs;
    }
    this.lastFrameAt = now;
  }

  private onPreRender(): void {
    const now = performance.now();
    const logicMs = now - this.stepStart;
    this.winLogicMs += logicMs;
    this.logicHist[this.histIndex] = logicMs;
    this.renderStart = now;
    this.drawCallsThisFrame = 0;
  }

  private onPostRender(): void {
    const now = performance.now();
    const renderMs = now - this.renderStart;
    this.winRenderMs += renderMs;
    this.winDrawCalls += this.drawCallsThisFrame;
    if (this.frameValid) {
      this.renderHist[this.histIndex] = renderMs;
      this.drawHist[this.histIndex] = this.drawCallsThisFrame;
      this.histIndex = (this.histIndex + 1) % HISTORY;
      if (this.histCount < HISTORY) this.histCount++;
    }

    if (now - this.winStartedAt >= SNAPSHOT_INTERVAL_MS && this.winFrames > 0) {
      this.latest = this.buildSnapshot();
      for (const listener of this.listeners) listener(this.latest);
      this.resetWindow();
    }
  }

  private resetWindow(): void {
    this.winFrames = 0;
    this.winFrameMs = 0;
    this.winFrameMax = 0;
    this.winLogicMs = 0;
    this.winRenderMs = 0;
    this.winDrawCalls = 0;
    this.winStartedAt = performance.now();
  }

  private onResume(): void {
    this.resetWindow();
    this.lastFrameAt = 0;
  }

  private buildSnapshot(): PerfSnapshot {
    const frames = this.winFrames;
    const frameAvg = this.winFrameMs / frames;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      fps: round(1000 / frameAvg, 1),
      frameMsAvg: round(frameAvg, 2),
      frameMsMax: round(this.winFrameMax, 1),
      logicMsAvg: round(this.winLogicMs / frames, 2),
      renderMsAvg: round(this.winRenderMs / frames, 2),
      sprites: this.countSprites(),
      drawCalls: round(this.winDrawCalls / frames, 1),
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      canvas: `${this.game.canvas.width}x${this.game.canvas.height}`,
      dpr: round(this.game.canvas.width / this.game.canvas.getBoundingClientRect().width, 2),
      heapMB: memory ? round(memory.usedJSHeapSize / 1048576, 1) : null,
    };
  }

  /** Visible display objects across running scenes (containers are walked, not counted). */
  private countSprites(): number {
    let count = 0;
    const walk = (list: Phaser.GameObjects.GameObject[]) => {
      for (const obj of list) {
        const visible = (obj as unknown as { visible?: boolean }).visible !== false;
        if (!visible) continue;
        if (obj instanceof Phaser.GameObjects.Container) walk(obj.list);
        else count++;
      }
    };
    for (const scene of this.game.scene.getScenes(true)) walk(scene.children.list);
    return count;
  }

  private wrapDrawCalls(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) return;
    const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl as unknown as Record<string, DrawFn>;
    const names = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
    for (const name of names) {
      const original = gl[name];
      if (typeof original !== 'function') continue;
      const bound = original.bind(gl) as (...args: unknown[]) => void;
      gl[name] = ((...args: unknown[]) => {
        this.drawCallsThisFrame++;
        bound(...args);
      }) as DrawFn;
    }
  }

  private emptySnapshot(): PerfSnapshot {
    return {
      fps: 0, frameMsAvg: 0, frameMsMax: 0, logicMsAvg: 0, renderMsAvg: 0, sprites: 0, drawCalls: 0,
      renderer: 'WebGL', canvas: '', dpr: 0, heapMB: null,
    };
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
