// Google Play store graphics from the real game: phone screenshots (1080×1920) in Korean and English,
// the 1024×500 feature graphic and the 512×512 icon. Written to artifacts/store/.
//
// Usage: npm run build && npm run store-art   (tsx, because levelCurve.ts is TypeScript)
// The headless browser's fonts differ a little from a phone's; screenshots taken on a phone can replace
// these any time.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { expectedModifiers } from './levelCurve.ts';

const OUT = 'artifacts/store';
const PORT = 4190;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Plays the battle without drawing until `until` holds, steering into the better gate like a player. */
function skip(page, until) {
  return page.evaluate((cond) => {
    const battle = window.__battle;
    const sim = battle.sim;
    const done = new Function('sim', `return ${cond};`);
    for (let i = 0; i < 60 * 600 && !sim.finished && !done(sim); i++) {
      let next = null;
      for (const g of sim.gates) if (!g.passed && g.z > sim.distance && (!next || g.z < next.z)) next = g;
      if (next && next.z - sim.distance < 700) battle.targetX = window.__dm.greedySide(sim, next) === 0 ? 210 : 510;
      battle.step(1 / 60);
    }
  }, until);
}

/** Resumes drawing. Floating words left over from the skipped part would sit frozen on screen; clear them. */
function wake(page) {
  return page.evaluate(() => {
    window.__battle.fx.clear();
    window.__dm.game.loop.wake();
  });
}

async function startScene(page, key, data) {
  await page.evaluate(
    ([k, d]) => {
      const { game } = window.__dm;
      for (const s of game.scene.getScenes(true)) if (s.scene.key !== k) game.scene.stop(s.scene.key);
      game.scene.start(k, d);
    },
    [key, data],
  );
  await page.waitForFunction((k) => window.__dm.game.scene.isActive(k), key, { timeout: 30000 });
}

async function shoot(browser, base, lang) {
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'ko' ? 'ko-KR' : 'en-US',
  });
  const page = await context.newPage();
  await page.goto(`${base}?debug=1`);
  await page.waitForFunction(() => window.__dm?.game.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => {
    // Hide the ?debug=1 readout; it is the only fixed element at z-index 10.
    for (const el of document.body.children) if (el instanceof HTMLElement && el.style.zIndex === '10') el.style.display = 'none';
    const { save } = window.__dm;
    save.data.settings.lowSpec = 'off';
    save.data.tutorial = { swipe: true, gate: true, merge: true, shelter: true };
    save.data.buildings = { wall: 4, armory: 3, farm: 3, radio: 2, garage: 2 };
    save.data.resources = { food: 1840, scrap: 1260, fuel: 95 };
  });
  const shot = (n) => page.screenshot({ path: `${OUT}/phone-${lang}-${n}.png` });

  await sleep(1200);
  await shot(1);

  // A big crowd just before a gate, halfway down the road.
  await startScene(page, 'Battle', { stage: 8, modifiers: expectedModifiers(8) });
  await page.evaluate(() => window.__dm.game.loop.sleep());
  await skip(page, 'sim.distance > sim.level.length * 0.4 && sim.gates.some((g) => !g.passed && g.z - sim.distance > 330 && g.z - sim.distance < 420)');
  await wake(page);
  await sleep(700);
  await shot(2);

  // Boss fight.
  await startScene(page, 'Battle', { stage: 10, modifiers: expectedModifiers(10) });
  await page.evaluate(() => window.__dm.game.loop.sleep());
  await skip(page, 'sim.boss.attacking && sim.boss.hp < sim.boss.hp0 * 0.7');
  await wake(page);
  await sleep(800);
  await shot(3);

  await startScene(page, 'Shelter');
  await sleep(1200);
  await shot(4);

  // Lobby art for the feature graphic.
  await startScene(page, 'Lobby');
  const art = await page.evaluate(() => {
    const { game } = window.__dm;
    const url = (key) => game.textures.get(key).getSourceImage().toDataURL('image/png');
    return { bg: url('lobby_bg'), logo: url('lobby_logo') };
  });
  await context.close();
  return art;
}

async function featureGraphic(browser, lang, art) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  const phone = (await readFile(`${OUT}/phone-${lang}-2.png`)).toString('base64');
  const tagline = lang === 'ko' ? '밀어서 이끌고, 게이트로 불리고, 합체로 뚫어라' : 'Swipe. Multiply. Merge. Break through.';
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;overflow:hidden;position:relative;background:#11140f;font-family:sans-serif">
    <img src="${art.bg}" style="position:absolute;left:0;top:-330px;width:1024px">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,8,8,.82) 0%,rgba(10,8,8,.55) 55%,rgba(10,8,8,.15) 100%)"></div>
    <img src="${art.logo}" style="position:absolute;left:40px;top:70px;width:560px">
    <div style="position:absolute;left:20px;width:600px;top:384px;text-align:center;white-space:nowrap;color:#ffd27a;font-weight:800;font-size:${lang === 'ko' ? 27 : 30}px;text-shadow:0 3px 8px #000">${tagline}</div>
    <div style="position:absolute;right:70px;top:24px;width:252px;height:448px;border-radius:30px;border:8px solid #0b0d0b;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.7);transform:rotate(4deg)">
      <img src="data:image/png;base64,${phone}" style="width:100%">
    </div>
  </body></html>`);
  await sleep(200);
  await page.screenshot({ path: `${OUT}/feature-${lang}-1024x500.png` });
  await page.close();
}

await mkdir(OUT, { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const lang of ['ko', 'en']) {
    const art = await shoot(browser, `http://localhost:${PORT}/`, lang);
    await featureGraphic(browser, lang, art);
    console.log('wrote', lang);
  }
  await copyFile('public/icons/icon-512.png', `${OUT}/icon-512.png`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
