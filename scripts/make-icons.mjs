// Draws the app icons with the browser's canvas (same drawing tools as the game art, no image files to keep
// in sync) and writes them as PNG files.
//
// Usage: npm run icons
//   public/icons/icon-192.png, icon-512.png       web app / favicon
//   public/icons/icon-maskable-512.png            Android home screen (content kept in the safe circle)
//   android/app/src/main/res/mipmap-*/            app launcher icons (square, round, adaptive layers)
//   android/app/src/main/res/drawable*/splash.png splash for Android 11 and older (12+ shows the icon)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Runs in the page. layer: 'full' (background + art), 'background', 'foreground' (art on transparent).
 * safe: fraction of the canvas the art may use (maskable and adaptive icons crop the edges).
 */
function drawIcon(size, layer, safe) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const S = size / 512;

  if (layer !== 'foreground') {
    const bg = c.createRadialGradient(size / 2, size * 0.42, 0, size / 2, size * 0.42, size * 0.75);
    bg.addColorStop(0, '#c2402b');
    bg.addColorStop(0.45, '#5e1420');
    bg.addColorStop(1, '#14080c');
    c.fillStyle = bg;
    c.fillRect(0, 0, size, size);
  }
  if (layer === 'background') return canvas.toDataURL('image/png');

  // Art is drawn in a 512 box, shrunk into the safe area.
  c.translate(size / 2, size / 2);
  c.scale(S * safe, S * safe);
  c.translate(-256, -256);

  // Road narrowing to the horizon.
  c.fillStyle = '#1b1c1c';
  c.beginPath();
  c.moveTo(236, 250);
  c.lineTo(276, 250);
  c.lineTo(470, 512);
  c.lineTo(42, 512);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(230,220,170,0.7)';
  for (const [y, h, w] of [
    [270, 18, 5],
    [310, 26, 8],
    [362, 36, 11],
  ]) {
    c.fillRect(256 - w / 2, y, w, h);
  }

  // Survivor crowd: a wedge of helmeted heads.
  const rows = [
    [256, 330, 1, 0],
    [256, 368, 2, 44],
    [256, 410, 3, 46],
    [256, 456, 4, 50],
    [256, 506, 5, 54],
  ];
  for (const [cx, y, n, gap] of rows) {
    const r = 15 + (y - 330) * 0.06;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * gap;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath();
      c.ellipse(x, y + r * 0.8, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2b6fd6';
      c.strokeStyle = '#0b1830';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(x, y, r * 1.15, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#5a7a3a';
      c.beginPath();
      c.arc(x, y - r * 0.15, r * 0.82, Math.PI, 0);
      c.fill();
    }
  }

  // The "×2" gate: the game's whole promise in one sign.
  const gx = 96;
  const gy = 70;
  const gw = 320;
  const gh = 170;
  c.fillStyle = '#0b1830';
  c.beginPath();
  c.roundRect(gx - 8, gy - 8, gw + 16, gh + 16, 40);
  c.fill();
  const blue = c.createLinearGradient(0, gy, 0, gy + gh);
  blue.addColorStop(0, '#5fb2ff');
  blue.addColorStop(1, '#1f6fe0');
  c.fillStyle = blue;
  c.beginPath();
  c.roundRect(gx, gy, gw, gh, 34);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.beginPath();
  c.roundRect(gx + 14, gy + 10, gw - 28, 40, 20);
  c.fill();
  c.font = '900 150px "Arial Black", Impact, Roboto, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 18;
  c.strokeStyle = '#0b1830';
  c.strokeText('×2', 256, gy + gh / 2 + 8);
  c.fillStyle = '#ffffff';
  c.fillText('×2', 256, gy + gh / 2 + 8);

  return canvas.toDataURL('image/png');
}

/** Round launcher icon: the full icon clipped to a circle. */
function drawRound(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const img = new Image();
  return new Promise((done) => {
    img.onload = () => {
      c.beginPath();
      c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      c.clip();
      c.drawImage(img, 0, 0, size, size);
      done(canvas.toDataURL('image/png'));
    };
    img.src = drawIcon(size, 'full', 1);
  });
}

/** Splash: the game's background color with the icon (rounded) in the middle. */
function drawSplash(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  c.fillStyle = '#11140f';
  c.fillRect(0, 0, width, height);
  const s = Math.round(Math.min(width, height) * 0.36);
  const img = new Image();
  return new Promise((done) => {
    img.onload = () => {
      c.beginPath();
      c.roundRect((width - s) / 2, (height - s) / 2, s, s, s * 0.22);
      c.clip();
      c.drawImage(img, (width - s) / 2, (height - s) / 2, s, s);
      done(canvas.toDataURL('image/png'));
    };
    img.src = drawIcon(s, 'full', 1);
  });
}

const RES = 'android/app/src/main/res';
// Launcher icon size in px per screen density (48dp); adaptive layers are 108dp.
const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
// Splash sizes Capacitor's template uses (portrait; landscape is the same turned sideways).
const SPLASHES = [
  ['mdpi', 320, 480],
  ['hdpi', 480, 800],
  ['xhdpi', 720, 1280],
  ['xxhdpi', 960, 1600],
  ['xxxhdpi', 1280, 1920],
];

const ICONS = [
  ['public/icons/icon-192.png', 192, 'full', 1],
  ['public/icons/icon-512.png', 512, 'full', 1],
  ['public/icons/icon-maskable-512.png', 512, 'full', 0.78],
];
for (const [dpi, px] of DENSITIES) {
  const layer = Math.round((px * 108) / 48);
  ICONS.push([`${RES}/mipmap-${dpi}/ic_launcher.png`, px, 'full', 1]);
  // Adaptive icons show the middle 72dp of 108dp and launchers may cut a circle out of that.
  ICONS.push([`${RES}/mipmap-${dpi}/ic_launcher_foreground.png`, layer, 'foreground', 0.58]);
  ICONS.push([`${RES}/mipmap-${dpi}/ic_launcher_background.png`, layer, 'background', 1]);
}

const dataUrlToBuffer = (url) => Buffer.from(url.split(',')[1], 'base64');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: `${drawIcon.toString()}\n${drawRound.toString()}\n${drawSplash.toString()}` });
    const write = async (file, url) => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, dataUrlToBuffer(url));
      console.log('wrote', file);
    };
    for (const [file, size, layer, safe] of ICONS) {
      await write(file, await page.evaluate(([a, b, c]) => drawIcon(a, b, c), [size, layer, safe]));
    }
    for (const [dpi, px] of DENSITIES) {
      await write(`${RES}/mipmap-${dpi}/ic_launcher_round.png`, await page.evaluate((n) => drawRound(n), px));
    }
    for (const [dpi, w, h] of SPLASHES) {
      await write(`${RES}/drawable-port-${dpi}/splash.png`, await page.evaluate(([a, b]) => drawSplash(a, b), [w, h]));
      await write(`${RES}/drawable-land-${dpi}/splash.png`, await page.evaluate(([a, b]) => drawSplash(a, b), [h, w]));
    }
    await write(`${RES}/drawable/splash.png`, await page.evaluate(() => drawSplash(480, 320)));
  } finally {
    await browser.close();
  }
}

await main();
