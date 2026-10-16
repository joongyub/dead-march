/** URL switches, read once at startup. Example: ?debug=1&bench=1000 */
const params = new URLSearchParams(window.location.search);

function intParam(name: string): number {
  const value = Number.parseInt(params.get(name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const flags = {
  /** Shows the performance overlay and exposes window.__dm for automated checks. */
  debug: params.get('debug') === '1',
  /** Spawns this many moving sprites in the battle scene to measure rendering cost. */
  bench: Math.min(intParam('bench'), 20000),
  /** Starts battles on the 5,000-army stress stage. */
  stress: params.get('stress') === '1',
} as const;
