// CPU cost of battles on a simulated low-end phone: Chrome's CPU throttling (4× and 6× slower) on
// stages 1, 10, 20 and the stress stage. Writes docs/perf.md.
//
// The headless browser has no GPU, so instead of trusting its frame rate this drives the game loop by
// hand: every frame is one game.step() of 1/60 s, timed in JavaScript (game logic + preparing the draw
// calls, which is the CPU part a phone also pays). GPU time is not included; on a phone it overlaps
// with the next frame's CPU work.
//
// Each battle is sampled in three windows of WINDOW frames: the start, the middle of the road, and
// the boss fight (the simulation skips ahead between windows).
//
// Usage: npm run build && npm run perf [-- --quick] [-- --profile]   (tsx, because levelCurve.ts is TypeScript)
//   --quick    4× only, fewer frames (CI)
//   --profile  also records a CPU profile of the stress stage at 4× on an unminified build and lists
//              the functions that take the most time (written to artifacts/profile.txt)
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';
import { expectedModifiers } from './levelCurve.ts';

const QUICK = process.argv.includes('--quick');
const PROFILE = process.argv.includes('--profile');
const THROTTLES = QUICK ? [4] : [4, 6];
const WINDOW = QUICK ? 150 : 300;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR' };

const SCENARIOS = [
  { name: '스테이지 1', data: { stage: 1, modifiers: expectedModifiers(1) } },
  { name: '스테이지 10', data: { stage: 10, modifiers: expectedModifiers(10) } },
  { name: '스테이지 20', data: { stage: 20, modifiers: expectedModifiers(20) } },
  { name: '스트레스 (병력 5,000)', data: { stress: true } },
  { name: '스트레스, 저사양 모드', data: { stress: true }, lowSpec: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBattle(page, base, scenario) {
  await page.goto(`${base}?debug=1`);
  await page.waitForFunction(() => window.__dm?.monitor && window.__dm.game.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate((low) => {
    const { game, save, setLowSpec } = window.__dm;
    save.data.settings.lowSpec = low ? 'on' : 'off';
    save.data.tutorial = { swipe: true, gate: true, merge: true, shelter: true };
    setLowSpec(low);
    game.scene.stop('Title');
  }, !!scenario.lowSpec);
  await page.evaluate((data) => window.__dm.game.scene.start('Battle', data), scenario.data);
  await page.waitForFunction(() => window.__dm.game.scene.isActive('Battle') && window.__battle, null, { timeout: 30000 });
  await sleep(500);
}

/** Runs `frames` hand-driven frames and returns each frame's CPU time in ms. */
async function sampleFrames(page, frames) {
  return page.evaluate((n) => {
    const { game, greedySide } = window.__dm;
    const battle = window.__battle;
    const times = [];
    let t = performance.now();
    for (let i = 0; i < n && !battle.sim.finished; i++) {
      const sim = battle.sim;
      let next = null;
      for (const g of sim.gates) if (!g.passed && g.z > sim.distance && (!next || g.z < next.z)) next = g;
      if (next && next.z - sim.distance < 700) battle.targetX = greedySide(sim, next) === 0 ? 210 : 510;
      t += 1000 / 60;
      const t0 = performance.now();
      game.step(t, 1000 / 60);
      times.push(performance.now() - t0);
    }
    return times;
  }, frames);
}

/** Simulation only (no drawing) until the condition holds. */
async function skipTo(page, where) {
  await page.evaluate((w) => {
    const battle = window.__battle;
    const sim = battle.sim;
    const done = () => sim.finished || (w === 'middle' ? sim.distance >= sim.level.length * 0.5 : sim.phase !== 'run');
    for (let i = 0; i < 60 * 600 && !done(); i++) {
      let next = null;
      for (const g of sim.gates) if (!g.passed && g.z > sim.distance && (!next || g.z < next.z)) next = g;
      if (next && next.z - sim.distance < 700) battle.targetX = window.__dm.greedySide(sim, next) === 0 ? 210 : 510;
      battle.step(1 / 60);
    }
  }, where);
}

async function run(page, base, scenario, throttle) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await openBattle(page, base, scenario);
  await page.evaluate(() => window.__dm.game.loop.sleep());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await sampleFrames(page, 30); // warm-up (JIT)
  await page.evaluate(() => window.__dm.monitor.reset());
  const times = [];
  times.push(...(await sampleFrames(page, WINDOW)));
  await skipTo(page, 'middle');
  times.push(...(await sampleFrames(page, WINDOW)));
  await skipTo(page, 'boss');
  times.push(...(await sampleFrames(page, WINDOW)));
  const summary = await page.evaluate(() => window.__dm.monitor.summary());
  const sprites = await page.evaluate(() => {
    const d = window.__battle.debugInfo;
    return d.units + d.zombies;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  const sorted = [...times].sort((a, b) => a - b);
  return {
    scenario: scenario.name,
    throttle,
    frames: times.length,
    avg: times.reduce((s, x) => s + x, 0) / times.length,
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    logic: summary.logicMsAvg,
    render: summary.renderMsAvg,
    drawCalls: summary.drawCallsAvg,
    sprites,
    heapMB: heap.usedSize / 1048576,
  };
}

/** CPU profile of the stress stage at 4×: self time per function, top 15. */
async function profile(page, base) {
  const cdp = await page.context().newCDPSession(page);
  await openBattle(page, base, SCENARIOS[3]);
  await page.evaluate(() => window.__dm.game.loop.sleep());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sampleFrames(page, 30);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await sampleFrames(page, 600);
  const { profile: prof } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < prof.samples.length; i++) {
    const node = byId.get(prof.samples[i]);
    const name = node.callFrame.functionName || '(anonymous)';
    if (name === '(idle)' || name === '(program)' || name === '(garbage collector)') continue;
    const file = node.callFrame.url.split('/').slice(-2).join('/').replace(/\?.*$/, '');
    const key = `${name}  ${file}:${node.callFrame.lineNumber + 1}`;
    const ms = (prof.timeDeltas[i] ?? 0) / 1000;
    self.set(key, (self.get(key) ?? 0) + ms);
    total += ms;
  }
  const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15);
  return [
    `Self time over 600 frames (stress stage, 4× CPU throttle), total ${total.toFixed(0)}ms of JS:`,
    ...rows.map(([k, v]) => `${v.toFixed(1).padStart(7)}ms ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`),
  ].join('\n');
}

const fmt = (x, d = 2) => x.toFixed(d);

async function main() {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const results = [];
  try {
    const server = await preview({ preview: { port: 4176, strictPort: true }, logLevel: 'error' });
    const base = 'http://localhost:4176/';
    const context = await browser.newContext(PHONE);
    const errors = [];
    for (const throttle of THROTTLES) {
      for (const scenario of SCENARIOS) {
        // A fresh tab per run, so one battle's leftovers never slow the next.
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        const r = await run(page, base, scenario, throttle);
        await page.close();
        results.push(r);
        console.log(`${throttle}x ${scenario.name.padEnd(16)} avg ${fmt(r.avg)}ms p99 ${fmt(r.p99)}ms draws ${fmt(r.drawCalls, 1)} sprites ${r.sprites} heap ${fmt(r.heapMB, 1)}MB`);
      }
    }
    await new Promise((r) => server.httpServer.close(r));
    if (errors.length) throw new Error(`Page errors: ${errors.join('\n')}`);

    if (PROFILE) {
      // Readable function names need an unminified build.
      await build({ logLevel: 'error', build: { minify: false, outDir: 'artifacts/dist-profile', emptyOutDir: true } });
      const profServer = await preview({ preview: { port: 4177, strictPort: true }, build: { outDir: 'artifacts/dist-profile' }, logLevel: 'error' });
      const text = await profile(await (await browser.newContext(PHONE)).newPage(), 'http://localhost:4177/');
      await new Promise((r) => profServer.httpServer.close(r));
      await writeFile('artifacts/profile.txt', text);
      console.log(text);
    }
  } finally {
    await browser.close();
  }

  await writeFile('artifacts/perf.json', JSON.stringify(results, null, 2));
  if (QUICK) return;

  const lines = [];
  lines.push('# 저사양 기기 CPU 측정');
  lines.push('');
  lines.push('`npm run build && npm run perf`로 다시 만들 수 있습니다. 크롬의 CPU 속도 제한(4배, 6배 느리게)으로 보급형 폰을 흉내 낸 값입니다.');
  lines.push('');
  lines.push('- 헤드리스 브라우저에는 GPU가 없어서 화면 주사율 대신 한 프레임(1/60초)씩 직접 돌리며 자바스크립트 시간(게임 로직 + 그리기 준비)을 잽니다. GPU가 픽셀을 칠하는 시간은 빠져 있고, 그건 휴대폰의 `?debug=1`로 봅니다.');
  lines.push(`- 전투마다 시작, 도로 중간, 보스전에서 ${WINDOW}프레임씩 잽니다. 스테이지 10, 20은 그 시점에 예상되는 피난처 강화를 적용했습니다.`);
  lines.push('- 1% 저점 = 가장 느린 1% 프레임의 시간(99번째 백분위). 예산은 한 프레임 16.6ms, 로직 4ms, 드로우 콜 20회, 메모리 250MB.');
  lines.push('');
  lines.push('| CPU | 장면 | 평균 프레임 CPU | 1% 저점 | 최대 | 로직 | 그리기 준비 | 드로우 콜 | 유닛 스프라이트 | JS 힙 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    lines.push(
      `| ${r.throttle}× | ${r.scenario} | ${fmt(r.avg)}ms | ${fmt(r.p99)}ms | ${fmt(r.max)}ms | ${fmt(r.logic)}ms | ${fmt(r.render)}ms | ${fmt(r.drawCalls, 1)} | ${r.sprites} | ${fmt(r.heapMB, 1)}MB |`,
    );
  }
  lines.push('');
  await writeFile('docs/perf.md', `${lines.join('\n')}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
