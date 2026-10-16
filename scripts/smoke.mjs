// Headless phone-sized smoke test: builds nothing, serves dist/, drives title → lobby → battle (with the
// stage 1 lessons) → pause → result → shelter, checks save recovery, runs the 5,000-army stress stage, records the ?debug=1 performance numbers and saves screenshots to artifacts/.
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
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR' };

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
          // Game units are canvas pixels / renderScale (low-spec mode renders at 75%).
          const k = rect.width / (game.scale.width / window.__dm.quality.renderScale);
          return { x: rect.left + x * k, y: rect.top + y * k };
        },
        [gx, gy],
      );
      await page.touchscreen.tap(pos.x, pos.y);
    };
    const size = () =>
      page.evaluate(() => {
        const { game, quality } = window.__dm;
        return { w: game.scale.width / quality.renderScale, h: game.scale.height / quality.renderScale };
      });
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
    // Drags a finger across the screen in game coordinates (touch events, like a phone).
    const dragGame = async (gx0, gy, gx1, steps = 12) => {
      const pts = await page.evaluate(
        ([x0, y, x1]) => {
          const { game } = window.__dm;
          const rect = game.canvas.getBoundingClientRect();
          // Game units are canvas pixels / renderScale (low-spec mode renders at 75%).
          const k = rect.width / (game.scale.width / window.__dm.quality.renderScale);
          return { x0: rect.left + x0 * k, x1: rect.left + x1 * k, y: rect.top + y * k };
        },
        [gx0, gy, gx1],
      );
      const cdp = await context.newCDPSession(page);
      const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: pts.y }] });
      await touch('touchStart', pts.x0);
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', pts.x0 + ((pts.x1 - pts.x0) * i) / steps);
        await sleep(30);
      }
      await touch('touchEnd', pts.x1);
      await cdp.detach();
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

    // Scene switches armed with expectSwitch(key) right before the tap are timed two ways:
    // work = old scene shut down → new scene created (what this code costs; the 160ms fade-in follows),
    // firstFrame = finger up → first frame of the new scene drawn (includes waiting for the next frame
    // and SwiftShader's slow drawing, so it is much longer here than on a phone; reported only).
    const watchSwitches = () =>
      page.evaluate(() => {
        const { game } = window.__dm;
        const log = (window.__switches = []);
        let tapAt = 0;
        let workStart = 0;
        window.__expectSwitch = null;
        document.addEventListener('pointerup', () => (tapAt = performance.now()), { capture: true });
        for (const scene of game.scene.scenes) {
          scene.events.on('shutdown', () => {
            if (window.__expectSwitch && !workStart) workStart = performance.now();
          });
          scene.events.on('create', () => {
            if (window.__expectSwitch !== scene.scene.key) return;
            window.__expectSwitch = null;
            const from = tapAt;
            const work = Math.round(performance.now() - (workStart || performance.now()));
            workStart = 0;
            game.events.once('postrender', () =>
              log.push({ to: scene.scene.key, work, firstFrame: Math.round(performance.now() - from) }),
            );
          });
        }
      });
    const expectSwitch = (key) => page.evaluate((k) => (window.__expectSwitch = k), key);
    // The title screen waits for a tap anywhere.
    const passTitle = async () => {
      await page.waitForFunction(() => window.__dm?.monitor && window.__dm.game.scene.isActive('Title'), null, { timeout: 15000 });
      await sleep(600);
      const { w: tw, h: th } = await size();
      await page.evaluate(() => window.__expectSwitch !== undefined && (window.__expectSwitch = 'Lobby'));
      await tapGame(tw / 2, th * 0.78);
      await page.waitForFunction(() => window.__dm.game.scene.isActive('Lobby'), null, { timeout: 10000 });
    };

    await page.goto(`${base}?debug=1`);
    await page.waitForFunction(() => window.__dm?.monitor && window.__dm.game.scene.isActive('Title'), null, { timeout: 15000 });
    await watchSwitches();
    // Budgets are checked at full quality; low-spec mode gets its own check at the end.
    await page.evaluate(() => {
      window.__dm.save.data.settings.lowSpec = 'off';
      window.__dm.save.commit();
    });
    await sleep(1200);
    results.scenesAtStart = await activeScenes();
    await page.screenshot({ path: `${OUT}/0-title.png` });
    await passTitle();
    await sleep(1200);
    await measure('lobby');
    await page.screenshot({ path: `${OUT}/1-lobby.png` });

    const { w, h } = await size();
    results.gameSize = `${w}x${h}`;

    // Settings open over the lobby and close back to it.
    // Waits instead of fixed sleeps: the CI machine's frames take up to half a second.
    const settle = (fn) => page.waitForFunction(fn, null, { timeout: 5000 }).then(() => true, () => false);
    await tapButton('Lobby', 'settingsButton');
    results.settingsOpened = await settle(() => window.__dm.game.scene.isActive('Settings'));
    await sleep(300);
    await page.screenshot({ path: `${OUT}/1b-settings.png` });
    await tapButton('Settings', 'closeButton');
    results.lobbyAfterSettings = await settle(
      () => window.__dm.game.scene.isActive('Lobby') && !window.__dm.game.scene.isActive('Settings'),
    );
    await expectSwitch('Battle');
    await tapButton('Lobby', 'startButton'); // 출격
    await sleep(800);
    results.scenesAfterStart = await activeScenes();
    // Stage 1 on a fresh save opens with the steering lesson; dragging clears it.
    results.swipeLessonShown = await settle(() => window.__battle?.tutorial.step === 'swipe');
    await page.screenshot({ path: `${OUT}/2-battle-lesson.png` });
    const { h: gh } = await size();
    // The lesson needs 220 units of finger travel; drag a little more than that.
    await dragGame(280, gh * 0.8, 540);
    results.swipeLearned = await settle(() => window.__dm.save.data.tutorial.swipe === true && window.__battle.tutorial.step !== 'swipe');
    await measure('battle');
    await page.screenshot({ path: `${OUT}/2-battle.png` });

    // App sent to background → battle must come back paused.
    await page.evaluate(() => {
      window.__dm.game.events.emit('hidden');
      window.__dm.game.events.emit('visible');
    });
    results.battlePausedAfterHidden = await settle(() => window.__dm.game.scene.isPaused('Battle'));
    await sleep(300);
    results.scenesAfterHidden = await activeScenes();
    await page.screenshot({ path: `${OUT}/3-pause.png` });
    // A tap that lands during one of SwiftShader's 200ms frames is occasionally dropped; one retry.
    for (let attempt = 0; attempt < 2 && !results.battleRunningAfterResume; attempt++) {
      await tapButton('Pause', 'resumeButton'); // 계속하기
      await sleep(500);
      results.battleRunningAfterResume = await page.evaluate(() => window.__dm.game.scene.isActive('Battle'));
    }

    // Back button (Escape on the web): battle -> pause menu -> back to the battle.
    await page.keyboard.press('Escape');
    results.backOpensPause = await settle(() => window.__dm.game.scene.isActive('Pause') && window.__dm.game.scene.isPaused('Battle'));
    await page.keyboard.press('Escape');
    results.backResumes = await settle(() => !window.__dm.game.scene.isActive('Pause') && window.__dm.game.scene.isActive('Battle'));

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
    console.log('stage 1 played through:', results.finished);
    await page
      .waitForFunction(() => window.__dm.game.scene.isActive('Result'), null, { timeout: 60000 })
      .catch(() => {});
    await sleep(800);
    results.scenesAtEnd = await activeScenes();
    await page.screenshot({ path: `${OUT}/4-result.png` });

    // First win with an upgrade in reach: the shelter button comes first, with the finger on it.
    results.resultShelterFirst = await page.evaluate(() => {
      const r = window.__dm.game.scene.getScene('Result');
      return r.buttons[0] === r.shelterButton && r.coach.visible;
    });

    // Rewarded ad (the web's pretend ad): watched to the end, the battle reward is paid a second time.
    results.adBefore = await page.evaluate(() => ({ ...window.__dm.save.data.resources }));
    results.adReward = await page.evaluate(() => window.__dm.game.scene.getScene('Result').result.outcome.reward);
    await tapButton('Result', 'adButton');
    await page.waitForSelector('[data-fake=primary]', { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/4b-fake-ad.png` });
    await page.click('[data-fake=primary]').catch(() => {});
    results.adLogged = await settle(() => window.__dm.events.some((e) => e.event === 'ad_reward'));
    results.adAfter = await page.evaluate(() => ({ ...window.__dm.save.data.resources }));

    // Shelter: go there from the result screen with resources in hand, upgrade through the upgrade window.
    await page.evaluate(() => {
      const { save } = window.__dm;
      save.data.resources = { food: 5000, scrap: 5000, fuel: 200 };
      save.data.idle.collectedAt = Date.now() - 3 * 3600 * 1000;
    });
    await expectSwitch('Shelter');
    await tapButton('Result', 'shelterButton');
    await page.waitForFunction(() => window.__dm.game.scene.isActive('Shelter'), null, { timeout: 10000 });
    await sleep(1200);
    results.shelterLessonShown = await page.evaluate(() => window.__dm.game.scene.getScene('Shelter').coach.visible);
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
    results.shelterLessonDone = await page.evaluate(() => window.__dm.save.data.tutorial.shelter === true);
    await measure('shelter', 3000);
    await tapButton('Shelter', 'homeButton'); // the first tap lands on the dimmed backdrop and closes the window
    await sleep(400);
    await expectSwitch('Lobby');
    await tapButton('Shelter', 'homeButton');
    await page.waitForFunction(() => window.__dm.game.scene.isActive('Lobby'), null, { timeout: 10000 });
    await sleep(600);
    results.switches = await page.evaluate(() => window.__switches);

    // Shop: buy a supply crate through the pretend checkout, then the back button closes the shop.
    await tapButton('Lobby', 'shopButton');
    results.shopOpened = await settle(() => window.__dm.game.scene.isActive('Shop'));
    await sleep(500);
    const foodBeforeCrate = await page.evaluate(() => window.__dm.save.data.resources.food);
    const cratePos = await page.evaluate(() => {
      const row = window.__dm.game.scene.getScene('Shop').rows.find((r) => r.id === 'supply_crate');
      return { x: row.buy.x, y: row.buy.y };
    });
    await tapGame(cratePos.x, cratePos.y);
    await page.waitForSelector('[data-fake=primary]', { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/9-shop-checkout.png` });
    await page.click('[data-fake=primary]').catch(() => {});
    await page.waitForFunction((before) => window.__dm.save.data.resources.food !== before, foodBeforeCrate, { timeout: 5000 }).catch(() => {});
    await sleep(300);
    await page.screenshot({ path: `${OUT}/9b-shop.png` });
    results.crateFood = (await page.evaluate(() => window.__dm.save.data.resources.food)) - foodBeforeCrate;
    await page.keyboard.press('Escape');
    results.shopClosedByBack = await settle(() => !window.__dm.game.scene.isActive('Shop') && window.__dm.game.scene.isActive('Lobby'));

    // A corrupted main save comes back from the backup instead of starting over.
    await page.evaluate(async () => {
      const { save } = window.__dm;
      await save.flush();
      await save.flush(); // the backup now holds the upgraded shelter too
      // Like a crash mid-write: no save on the way out, and a half-written main copy.
      save.flush = async () => {};
      save.commit = () => {};
      localStorage.setItem('dead-march.save', '{"h":"0","d":"{broken');
    });
    await page.reload();
    await page.waitForFunction(() => window.__dm?.monitor && window.__dm.game.scene.isActive('Title'), null, { timeout: 15000 });
    results.recovered = await page.evaluate(() => ({
      recovered: window.__dm.save.recovered,
      wall: window.__dm.save.data.buildings.wall ?? 1,
      unlocked: window.__dm.save.data.unlocked,
    }));

    // Heaviest battle: 5,000+ army against back-to-back hordes.
    await page.goto(`${base}?debug=1&stress=1`);
    await passTitle();
    await sleep(600);
    await tapButton('Lobby', 'startButton');
    await sleep(2500);
    await measure('stress', 6000);
    results.stressSprites = await page.evaluate(() => window.__battle.debugInfo);
    await page.screenshot({ path: `${OUT}/5-stress.png` });

    // Low-spec mode: with the setting on 'auto', slow frames (every frame is slow here) switch it on
    // after 3 seconds: 75% canvas, at most 120 unit sprites.
    await page.evaluate(() => {
      const { game, save } = window.__dm;
      save.data.settings.lowSpec = 'auto';
      save.data.device.lowSpec = false;
      game.scene.getScene('Battle').scene.restart({ stress: true });
    });
    await page.waitForFunction(() => window.__dm.quality.low, null, { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    await measure('stressLow', 6000);
    results.lowSpec = await page.evaluate(() => ({
      low: window.__dm.quality.low,
      canvas: `${window.__dm.game.canvas.width}x${window.__dm.game.canvas.height}`,
      remembered: window.__dm.save.data.device.lowSpec,
      sprites: window.__battle.debugInfo,
    }));
    await page.screenshot({ path: `${OUT}/5b-stress-lowspec.png` });
    await page.evaluate(() => {
      window.__dm.save.data.settings.lowSpec = 'off';
      window.__dm.save.commit();
    });

    // Raw rendering cost with many sprites on screen.
    await page.goto(`${base}?debug=1&bench=2000`);
    await passTitle();
    await sleep(600);
    await tapButton('Lobby', 'startButton');
    await sleep(1000);
    await measure('bench2000');
    await page.screenshot({ path: `${OUT}/6-bench2000.png` });
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }

  const measured = ['lobby', 'battle', 'shelter', 'stress', 'stressLow', 'bench2000'].map((k) => results[k]?.summary).filter(Boolean);
  const unitSprites = (results.stressSprites?.units ?? Infinity) + (results.stressSprites?.zombies ?? Infinity);
  // Work plus the 160ms fade-in has to fit in 300ms.
  const slowestSwitch = Math.max(...(results.switches ?? [{ work: Infinity }]).map((s) => s.work));
  results.checks = {
    'title -> lobby by tap': results.switches?.some((s) => s.to === 'Lobby') ?? false,
    'settings open and close over the lobby': results.settingsOpened === true && results.lobbyAfterSettings === true,
    'lobby -> battle by tap': results.scenesAfterStart?.includes('Battle') ?? false,
    'background -> battle paused': results.battlePausedAfterHidden === true,
    'resume button -> battle running': results.battleRunningAfterResume === true,
    'back button: battle -> pause -> battle': results.backOpensPause === true && results.backResumes === true,
    'stage played to the end -> result screen': results.scenesAtEnd?.includes('Result') ?? false,
    'stage 1 steering lesson, cleared by dragging': results.swipeLessonShown === true && results.swipeLearned === true,
    'first upgrade lesson: result -> shelter -> upgrade': results.resultShelterFirst === true && results.shelterLessonShown === true && results.shelterLessonDone === true,
    'shelter upgrade raises the wall': results.wallAfter === results.wallBefore + 1,
    'rewarded ad pays the battle reward again': !!results.adReward && ['food', 'scrap', 'fuel'].every((r) => results.adAfter?.[r] === results.adBefore[r] + results.adReward[r]) && results.adLogged === true,
    'shop: supply crate bought, back button closes the shop': results.shopOpened === true && results.crateFood === 400 && results.shopClosedByBack === true,
    'corrupted save restored from backup': results.recovered?.recovered === true && results.recovered.wall === results.wallAfter && results.recovered.unlocked >= 2,
    [`scene switch work + 160ms fade <= 300ms (slowest work ${slowestSwitch}ms)`]: slowestSwitch + 160 <= 300,
    'logic <= 4ms (stress, 5000+ army)': (results.stress?.summary.logicMsAvg ?? Infinity) <= 4,
    'logic <= 4ms (2000 sprites)': (results.bench2000?.summary.logicMsAvg ?? Infinity) <= 4,
    'unit sprites <= 200 (stress)': unitSprites <= 200,
    'draw calls <= 20': measured.length === 6 && measured.every((m) => m.drawCallsAvg <= 20),
    'auto low-spec: slow frames -> 75% canvas, <= 120 unit sprites, remembered':
      results.lowSpec?.low === true &&
      results.lowSpec.canvas.startsWith('540x') &&
      results.lowSpec.remembered === true &&
      results.lowSpec.sprites.units + results.lowSpec.sprites.zombies <= 120,
    'no JS errors': results.errors.length === 0,
  };

  await writeFile(`${OUT}/smoke.json`, JSON.stringify(results, null, 2));
  for (const [label, data] of Object.entries(results)) {
    if (data?.summary) console.log(label.padEnd(10), JSON.stringify(data.summary));
  }
  console.log('switches  ', JSON.stringify(results.switches));
  console.log('low-spec  ', JSON.stringify(results.lowSpec));
  for (const [name, ok] of Object.entries(results.checks)) console.log(ok ? 'PASS' : 'FAIL', name);
  if (Object.values(results.checks).includes(false)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
