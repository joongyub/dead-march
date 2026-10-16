// Draws the app icons with the browser's canvas (same drawing tools as the game art, no image files to keep
// in sync) and writes them as PNG files.
//
// Usage: npm run icons
//   public/icons/icon-192.png, icon-512.png       web app / favicon
//   public/icons/icon-maskable-512.png            Android home screen (content kept in the safe circle)
//   assets/icon-*.png, assets/splash*.png         sources for the Android app icons and splash (stage 9)
import { mkdir, writeFile } from 'node:fs/promises';
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

/** Splash: dark screen with the icon art in the middle. */
function drawSplash(size, dark) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  c.fillStyle = dark ? '#0b0608' : '#11140f';
  c.fillRect(0, 0, size, size);
  return { canvas, c };
}

const OUTPUTS = [
  ['public/icons/icon-192.png', 192, 'full', 1],
  ['public/icons/icon-512.png', 512, 'full', 1],
  ['public/icons/icon-maskable-512.png', 512, 'full', 0.78],
  ['assets/icon-only.png', 1024, 'full', 1],
  ['assets/icon-foreground.png', 1024, 'foreground', 0.62],
  ['assets/icon-background.png', 1024, 'background', 1],
];

async function main() {
  await mkdir('public/icons', { recursive: true });
  await mkdir('assets', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    for (const [file, size, layer, safe] of OUTPUTS) {
      const url = await page.evaluate(`(${drawIcon.toString()})(${size}, '${layer}', ${safe})`);
      await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', file);
    }
    // Splash screens: icon art centered on a plain background, 2732 square (Capacitor crops to each screen).
    for (const [file, dark] of [
      ['assets/splash.png', false],
      ['assets/splash-dark.png', true],
    ]) {
      const url = await page.evaluate(
        `(() => {
          const { canvas, c } = (${drawSplash.toString()})(2732, ${dark});
          const img = new Image();
          return new Promise((done) => {
            img.onload = () => {
              c.beginPath();
              c.roundRect(2732 / 2 - 400, 2732 / 2 - 400, 800, 800, 180);
              c.clip();
              c.drawImage(img, 2732 / 2 - 400, 2732 / 2 - 400, 800, 800);
              done(canvas.toDataURL('image/png'));
            };
            img.src = (${drawIcon.toString()})(800, 'full', 1);
          });
        })()`,
      );
      await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', file);
    }
  } finally {
    await browser.close();
  }
}

await main();
