// Memory leak check: 30 battles in a row, the way a player goes (result → retry/next, a trip through the
// shelter and lobby every 10 battles), measuring after each checkpoint with a forced garbage collection:
// JS heap, textures, game objects in every scene, running tweens, and the listeners scenes register on
// the game, scale manager and input. Anything that keeps growing is a leak. Writes artifacts/leak.json.
//
// Usage: npm run build && npm run leak
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const BATTLES = 30;
const CHECKPOINTS = [5, 10, 20, 30];
/** Allowed JS heap growth from the first checkpoint to the last. */
const HEAP_GROWTH_MB = 4;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir('artifacts', { recursive: true });
  const server = await preview({ preview: { port: 4178, strictPort: true }, logLevel: 'error' });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const samples = [];
  try {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    const cdp = await page.context().newCDPSession(page);
    await page.goto('http://localhost:4178/?debug=1');
    await page.waitForFunction(() => window.__dm?.monitor && window.__dm.game.scene.isActive('Title'), null, { timeout: 30000 });
    await page.evaluate(() => {
      const { game, save } = window.__dm;
      save.data.settings.lowSpec = 'off';
      save.data.tutorial = { swipe: true, gate: true, merge: true, shelter: true };
      save.data.unlocked = 5;
      game.scene.start('Lobby');
    });
    await sleep(500);

    const measure = async (battles) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const counts = await page.evaluate(() => {
        const { game } = window.__dm;
        let objects = 0;
        for (const s of game.scene.scenes) objects += s.sys.displayList?.length ?? 0;
        let tweens = 0;
        for (const s of game.scene.scenes) tweens += s.tweens?.getTweens().length ?? 0;
        const battle = game.scene.getScene('Battle');
        return {
          textures: Object.keys(game.textures.list).length,
          objects,
          tweens,
          gameListeners: game.events.eventNames().reduce((n, e) => n + game.events.listenerCount(e), 0),
          scaleListeners: game.scale.listenerCount('resize'),
          battleInputListeners: battle.input ? battle.input.eventNames().reduce((n, e) => n + battle.input.listenerCount(e), 0) : 0,
          domNodes: document.getElementsByTagName('*').length,
        };
      });
      const sample = { battles, heapMB: +(heap.usedSize / 1048576).toFixed(2), ...counts };
      samples.push(sample);
      console.log(JSON.stringify(sample));
    };

    for (let i = 1; i <= BATTLES; i++) {
      const stage = ((i - 1) % 5) + 1;
      // Retry/next from the result screen when it is up, otherwise start from the lobby.
      await page.evaluate((n) => {
        const { game } = window.__dm;
        const result = game.scene.getScene('Result');
        if (game.scene.isActive('Result')) result.startBattle(n);
        else game.scene.start('Battle', { stage: n });
      }, stage);
      await page.waitForFunction(() => window.__dm.game.scene.isActive('Battle') && window.__battle?.sim.distance > 0, null, { timeout: 30000 });
      await sleep(300);
      // Play the rest at full speed, then let the end-of-battle timer run out.
      await page.evaluate(() => {
        const battle = window.__battle;
        const { greedySide } = window.__dm;
        for (let f = 0; f < 60 * 300 && !battle.sim.finished; f++) {
          const sim = battle.sim;
          let next = null;
          for (const g of sim.gates) if (!g.passed && g.z > sim.distance && (!next || g.z < next.z)) next = g;
          if (next && next.z - sim.distance < 700) battle.targetX = greedySide(sim, next) === 0 ? 210 : 510;
          battle.step(1 / 60);
        }
        battle.endTimer = Math.min(battle.endTimer, 1);
      });
      await page.waitForFunction(() => window.__dm.game.scene.isActive('Result'), null, { timeout: 60000 });
      await sleep(200);
      if (i % 10 === 0) {
        // Through the shelter and the lobby, as a player would between sessions.
        await page.evaluate(() => window.__dm.game.scene.getScene('Result').toShelter());
        await page.waitForFunction(() => window.__dm.game.scene.isActive('Shelter'), null, { timeout: 30000 });
        await sleep(300);
        await page.evaluate(() => window.__dm.game.scene.start('Lobby'));
        await page.waitForFunction(() => window.__dm.game.scene.isActive('Lobby'), null, { timeout: 30000 });
        await sleep(300);
      }
      if (CHECKPOINTS.includes(i)) await measure(i);
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const steady = (key) => samples.every((s) => s[key] <= first[key]);
  const checks = {
    [`JS heap grows < ${HEAP_GROWTH_MB}MB from battle ${first?.battles} to ${last?.battles} (${(last?.heapMB - first?.heapMB).toFixed(2)}MB)`]:
      last.heapMB - first.heapMB < HEAP_GROWTH_MB,
    'texture count steady': steady('textures'),
    'game / scale / input listeners steady': steady('gameListeners') && steady('scaleListeners') && steady('battleInputListeners'),
    'DOM nodes steady': steady('domNodes'),
    'no JS errors': errors.length === 0,
  };
  await writeFile('artifacts/leak.json', JSON.stringify({ samples, checks, errors }, null, 2));
  for (const [name, ok] of Object.entries(checks)) console.log(ok ? 'PASS' : 'FAIL', name);
  if (errors.length) console.log(errors.join('\n'));
  if (Object.values(checks).includes(false)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
