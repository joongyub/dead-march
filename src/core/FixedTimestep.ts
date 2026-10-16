/**
 * Runs game logic at a fixed rate regardless of the screen's refresh rate,
 * so a 120Hz phone and a 60Hz phone produce the same battle result.
 */
export class FixedTimestep {
  private accumulator = 0;

  constructor(
    private readonly stepMs = 1000 / 60,
    /** Upper bound on catch-up steps per frame, so one slow frame cannot snowball. */
    private readonly maxStepsPerFrame = 4,
  ) {}

  /** Runs `step` zero or more times; returns 0..1 for interpolating what is drawn. */
  advance(deltaMs: number, step: (dtSeconds: number) => void): number {
    this.accumulator += Math.min(deltaMs, 250);
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
      step(this.stepMs / 1000);
      this.accumulator -= this.stepMs;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.accumulator = 0;
    return this.accumulator / this.stepMs;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
