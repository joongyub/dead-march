import type { PerfMonitor, PerfSnapshot } from './PerfMonitor';

const BUDGET_FRAME_MS = 16.6;
const BUDGET_LOGIC_MS = 4;
const BUDGET_DRAW_CALLS = 20;

/**
 * Corner readout for ?debug=1. It is a DOM element updated 4 times a second,
 * not a Phaser Text, so it does not add draw calls or texture uploads to what it measures.
 */
export class DebugOverlay {
  private readonly el: HTMLDivElement;

  constructor(monitor: PerfMonitor) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      // Bottom corner: the battle HUD and buttons live at the top.
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 4px)',
      zIndex: '10',
      padding: '4px 6px',
      background: 'rgba(0, 0, 0, 0.6)',
      color: '#cfe8c4',
      font: '10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      borderRadius: '4px',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    monitor.onSnapshot((s) => this.render(s));
  }

  private render(s: PerfSnapshot): void {
    const mark = (value: number, budget: number) => (value > budget ? ' !' : '');
    this.el.textContent =
      `FPS ${s.fps.toFixed(1)} · ${s.frameMsAvg.toFixed(1)}ms (max ${s.frameMsMax.toFixed(0)})${mark(s.frameMsAvg, BUDGET_FRAME_MS)}\n` +
      `logic ${s.logicMsAvg.toFixed(2)}${mark(s.logicMsAvg, BUDGET_LOGIC_MS)} · render ${s.renderMsAvg.toFixed(2)}ms\n` +
      `sprites ${s.sprites} · draws ${s.drawCalls}${mark(s.drawCalls, BUDGET_DRAW_CALLS)}\n` +
      `${s.renderer} ${s.canvas} @${s.dpr}x` +
      (s.heapMB !== null ? ` · ${s.heapMB}MB` : '');
    this.el.style.color = s.frameMsAvg > BUDGET_FRAME_MS * 1.1 ? '#ffb4a8' : '#cfe8c4';
  }
}
