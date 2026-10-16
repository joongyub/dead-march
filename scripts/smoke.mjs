// Headless phone-sized smoke test: builds nothing, serves dist/, drives lobby → battle → pause → result,
// runs the 5,000-army stress stage, records the ?debug=1 performance numbers and saves screenshots to artifacts/.
//
// Usage: npm run build && npm run smoke [-- --throttle=4]
//
// The cloud browser has no GPU: it rasterizes every pixel on the CPU (SwiftShader), so its FPS is far
// below a phone's and is not checked. What is checked are the CPU-side costs this code controls
// (logic time, draw calls) plus the scene flow; real FPS is read on a phone with ?debug=1.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const OUT = 'artifacts';
const throttleArg = process.argv.find((a) => a.startsWith('--throttle='));
const THROTTLE = throttleArg ? Number(throttleArg.split('=')[1]) : 1;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'error' });
  const base = 'http://localhost:4173/';
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const results = { throttle: THROTTLE, errors: [] };

  try {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    page.on('pageerror', (e) => results.errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && results.errors.push(m.text()));
    if (THROTTLE > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    }

    // Converts game coordinates to page coordinates and taps there, like a finger would.
    const tapGame = async (gx, gy) => {
      const pos = await page.evaluate(
        ([x, y]) => {
          const { game } = window.__dm;
          const rect = game.canvas.getBoundingClientRect();
          const k = rect.width / game.scale.width;
          return { x: rect.left + x * k, y: rect.top + y * k };
        },
        [gx, gy],
      );
      await page.touchscreen.tap(pos.x, pos.y);
    };
    const size = () => page.evaluate(() => ({ w: window.__dm.game.scale.width, h: window.__dm.game.scale.height }));
    // Taps a button by its scene field name, wherever the layout put it.
    const tapButton = async (sceneKey, field) => {
      const pos = await page.evaluate(
        ([key, name]) => {
          const b = window.__dm.game.scene.getScene(key)[name];
          return { x: b.x, y: b.y };
        },
        [sceneKey, field],
      );
      await tapGame(pos.x, pos.y);
    };
    const activeScenes = () =>
      page.evaluate(() => window.__dm.game.scene.getScenes(true).map((s) => s.scene.key));
    const measure = async (label, ms = 4000) => {
      await page.evaluate(() => window.__dm.monitor.reset());
      await sleep(ms);
      const data = await page.evaluate(() => ({
        summary: window.__dm.monitor.summary(),
        snapshot: window.__dm.monitor.snapshot(),
      }));
      results[label] = data;
      return data;
    };

    await page.goto(`${base}?debug=1`);
    await page.waitForFunction(() => window.__dm?.monitor, null, { timeout: 15000 });
    await sleep(1500);
    results.scenesAtStart = await activeScenes();
    await measure('lobby');
    await page.screenshot({ path: `${OUT}/1-lobby.png` });

    const { w, h } = await size();
    results.gameSize = `${w}x${h}`;

    // Settings open over the lobby and close back to it.
    await tapButton('Lobby', 'settingsButton');
    await sleep(500);
    results.settingsOpened = await page.evaluate(() => window.__dm.game.scene.isActive('Settings'));
    await page.screenshot({ path: `${OUT}/1b-settings.png` });
    await tapButton('Settings', 'closeButton');
    await sleep(500);
    results.lobbyAfterSettings = await page.evaluate(
      () => window.__dm.game.scene.isActive('Lobby') && !window.__dm.game.scene.isActive('Settings'),
    );
    await tapButton('Lobby', 'startButton'); // 출격
    await sleep(800);
    results.scenesAfterStart = await activeScenes();
    await measure('battle');
    await page.screenshot({ path: `${OUT}/2-battle.png` });

    // App sent to background → battle must come back paused.
    await page.evaluate(() => {
      window.__dm.game.events.emit('hidden');
      window.__dm.game.events.emit('visible');
    });
    await sleep(500);
    results.scenesAfterHidden = await activeScenes();
    results.battlePausedAfterHidden = await page.evaluate(() =>
      window.__dm.game.scene.isPaused('Battle'),
    );
    await page.screenshot({ path: `${OUT}/3-pause.png` });
    await tapButton('Pause', 'resumeButton'); // 계속하기
    await sleep(500);
    results.battleRunningAfterResume = await page.evaluate(() => window.__dm.game.scene.isActive('Battle'));

    // Play the rest of the stage at full speed (same rules, no rendering in between) → result screen.
    results.finished = await page.evaluate(() => {
      const battle = window.__battle;
      for (let i = 0; i < 60 * 240 && !battle.sim.finished; i++) {
        const sim = battle.sim;
        const gate = sim.gates.find((g) => !g.passed && g.z - sim.distance < 700);
        if (gate) battle.targetX = gate.left.kind === 'mul' || gate.right.kind === 'sub' ? 210 : 510;
        battle.step(1 / 60);
      }
      return battle.sim.phase;
    });
    await page
      .waitForFunction(() => window.__dm.game.scene.isActive('Result'), null, { timeout: 15000 })
      .catch(() => {});
    await sleep(800);
    results.scenesAtEnd = await activeScenes();
    await page.screenshot({ path: `${OUT}/4-result.png` });

    // Shelter: open it with resources in hand, upgrade the wall through the upgrade window.
    await page.evaluate(() => {
      const { game, save } = window.__dm;
      save.data.resources = { food: 5000, scrap: 5000, fuel: 200 };
      save.data.idle.collectedAt = Date.now() - 3 * 3600 * 1000;
      // Stop everything still running or paused underneath (battle, result) before opening the shelter.
      for (const s of game.scene.scenes) if (s.scene.isActive() || s.scene.isPaused()) s.scene.stop();
      game.scene.start('Shelter');
    });
    await page.waitForFunction(() => window.__dm.game.scene.isActive('Shelter'), null, { timeout: 10000 });
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/7-shelter.png` });
    results.wallBefore = await page.evaluate(() => window.__dm.save.data.buildings.wall ?? 1);
    await page.evaluate(() => {
      const shelter = window.__dm.game.scene.getScene('Shelter');
      window.__wallPos = (({ x, y }) => ({ x, y: y - 40 }))(shelter.views.find((v) => v.id === 'wall').image);
    });
    const wallPos = await page.evaluate(() => window.__wallPos);
    await tapGame(wallPos.x, wallPos.y);
    await sleep(400);
    await page.screenshot({ path: `${OUT}/8-upgrade.png` });
    const upgradePos = await page.evaluate(() => {
      const shelter = window.__dm.game.scene.getScene('Shelter');
      const m = shelter.modal;
      return { x: m.x + shelter.modalButton.x, y: m.y + shelter.modalButton.y };
    });
    await tapGame(upgradePos.x, upgradePos.y);
    await sleep(400);
    results.wallAfter = await page.evaluate(() => window.__dm.save.data.buildings.wall ?? 1);
    await measure('shelter', 3000);

    // Heaviest battle: 5,000+ army against back-to-back hordes.
    await page.goto(`${base}?debug=1&stress=1`);
    await page.waitForFunction(() => window.__dm?.monitor, null, { timeout: 15000 });
    await sleep(1000);
    await tapButton('Lobby', 'startButton');
    await sleep(2500);
    await measure('stress', 6000);
    results.stressSprites = await page.evaluate(() => window.__battle.debugInfo);
    await page.screenshot({ path: `${OUT}/5-stress.png` });

    // Raw rendering cost with many sprites on screen.
    await page.goto(`${base}?debug=1&bench=2000`);
    await page.waitForFunction(() => window.__dm?.monitor, null, { timeout: 15000 });
    await sleep(1000);
    await tapButton('Lobby', 'startButton');
    await sleep(1000);
    await measure('bench2000');
    await page.screenshot({ path: `${OUT}/6-bench2000.png` });
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }

  const measured = ['lobby', 'battle', 'shelter', 'stress', 'bench2000'].map((k) => results[k]?.summary).filter(Boolean);
  const unitSprites = (results.stressSprites?.units ?? Infinity) + (results.stressSprites?.zombies ?? Infinity);
  results.checks = {
    'settings open and close over the lobby': results.settingsOpened === true && results.lobbyAfterSettings === true,
    'lobby -> battle by tap': results.scenesAfterStart?.includes('Battle') ?? false,
    'background -> battle paused': results.battlePausedAfterHidden === true,
    'resume button -> battle running': results.battleRunningAfterResume === true,
    'stage played to the end -> result screen': results.scenesAtEnd?.includes('Result') ?? false,
    'shelter upgrade raises the wall': results.wallAfter === results.wallBefore + 1,
    'logic <= 4ms (stress, 5000+ army)': (results.stress?.summary.logicMsAvg ?? Infinity) <= 4,
    'logic <= 4ms (2000 sprites)': (results.bench2000?.summary.logicMsAvg ?? Infinity) <= 4,
    'unit sprites <= 200 (stress)': unitSprites <= 200,
    'draw calls <= 20': measured.length === 5 && measured.every((m) => m.drawCallsAvg <= 20),
    'no JS errors': results.errors.length === 0,
  };

  await writeFile(`${OUT}/smoke.json`, JSON.stringify(results, null, 2));
  for (const [label, data] of Object.entries(results)) {
    if (data?.summary) console.log(label.padEnd(10), JSON.stringify(data.summary));
  }
  for (const [name, ok] of Object.entries(results.checks)) console.log(ok ? 'PASS' : 'FAIL', name);
  if (Object.values(results.checks).includes(false)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
