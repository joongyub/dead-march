import { FONT_FAMILY } from '../config';
import { circle, ellipse, line, linear, polygon, radial, roundRect, seeded, shadow, type Ctx } from './draw';

/**
 * Every battle picture, drawn once at startup into one texture atlas (see atlas.ts). Drawing in code keeps
 * the download tiny and the style consistent. Allies are blue/green, zombies purple/red, so they read apart
 * at a glance on a small screen. White frames are meant to be tinted.
 */
export interface FrameSpec {
  name: string;
  w: number;
  h: number;
  draw: (ctx: Ctx, w: number, h: number) => void;
}

const TEAM = '#4fc3ff';
const TEAM_DARK = '#0f4c75';
const OUTLINE = '#141018';
const ZSKIN = '#a294bd';
const ZSKIN_DARK = '#6f6189';
const ZEYE = '#ff3046';

// ---------- basic shapes (white, tinted at runtime) ----------

const basics: FrameSpec[] = [
  { name: 'px', w: 4, h: 4, draw: (c) => roundRect(c, 0, 0, 4, 4, 0, '#fff') },
  { name: 'panel', w: 64, h: 64, draw: (c) => roundRect(c, 0, 0, 64, 64, 20, '#fff') },
  { name: 'pill', w: 64, h: 64, draw: (c) => roundRect(c, 0, 0, 64, 64, 32, '#fff') },
  {
    name: 'panelEdge',
    w: 64,
    h: 64,
    draw: (c) => {
      roundRect(c, 2, 2, 60, 60, 18, 'rgba(255,255,255,0.12)', '#fff', 4);
    },
  },
  { name: 'circle', w: 64, h: 64, draw: (c) => circle(c, 32, 32, 31, '#fff') },
  {
    name: 'soft',
    w: 64,
    h: 64,
    draw: (c) => circle(c, 32, 32, 32, radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']])),
  },
  {
    name: 'ring',
    w: 128,
    h: 128,
    draw: (c) => {
      c.beginPath();
      c.arc(64, 64, 54, 0, Math.PI * 2);
      c.lineWidth = 10;
      c.strokeStyle = '#fff';
      c.stroke();
      c.beginPath();
      c.arc(64, 64, 60, 0, Math.PI * 2);
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.stroke();
    },
  },
  {
    name: 'shadow',
    w: 64,
    h: 32,
    draw: (c) => shadow(c, 32, 16, 31, 15, 0.55),
  },
  {
    name: 'tracer',
    w: 8,
    h: 56,
    draw: (c) => {
      c.beginPath();
      c.moveTo(4, 0);
      c.lineTo(7, 8);
      c.lineTo(5, 56);
      c.lineTo(3, 56);
      c.lineTo(1, 8);
      c.closePath();
      c.fillStyle = linear(c, 0, 0, 0, 56, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,250,220,0.9)'], [1, 'rgba(255,220,150,0)']]);
      c.fill();
    },
  },
  {
    name: 'spark',
    w: 16,
    h: 16,
    draw: (c) => polygon(c, [8, 0, 10, 6, 16, 8, 10, 10, 8, 16, 6, 10, 0, 8, 6, 6], '#fff'),
  },
  {
    name: 'chunk',
    w: 14,
    h: 14,
    draw: (c) => polygon(c, [2, 4, 8, 0, 14, 5, 12, 12, 5, 14, 0, 9], '#fff'),
  },
  {
    name: 'blood',
    w: 64,
    h: 64,
    draw: (c) => {
      const rand = seeded(7);
      circle(c, 32, 32, 16, 'rgba(255,255,255,0.95)');
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2;
        const d = 12 + rand() * 16;
        circle(c, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 3 + rand() * 6, 'rgba(255,255,255,0.9)');
      }
    },
  },
  { name: 'dash', w: 12, h: 64, draw: (c) => roundRect(c, 0, 0, 12, 64, 4, '#fff') },
];

// ---------- allies (facing up, the way they march) ----------

const allies: FrameSpec[] = [
  {
    name: 'u0',
    w: 40,
    h: 40,
    draw: (c) => {
      shadow(c, 20, 32, 13, 5);
      ellipse(c, 9.5, 24, 3.6, 5.2, '#2f7fd0', OUTLINE, 1.5);
      ellipse(c, 30.5, 24, 3.6, 5.2, '#2f7fd0', OUTLINE, 1.5);
      ellipse(c, 20, 25, 11, 8, '#2f86dd', OUTLINE, 2);
      roundRect(c, 14, 23, 12, 10, 3, '#8a5a2b', '#3a2410', 1.5);
      circle(c, 13.6, 15.5, 1.9, '#e0b48a');
      circle(c, 26.4, 15.5, 1.9, '#e0b48a');
      circle(c, 20, 15, 6.6, '#4a3020', OUTLINE, 1.5);
      ellipse(c, 18.5, 12.8, 2.6, 1.6, 'rgba(255,255,255,0.18)');
    },
  },
  {
    name: 'u1',
    w: 44,
    h: 44,
    draw: (c) => {
      shadow(c, 22, 35, 14, 5.5);
      line(c, 32, 4, 32, 26, '#1d2126', 4);
      line(c, 32, 4, 32, 8, '#5b636b', 4);
      ellipse(c, 9.5, 27, 3.8, 5.6, TEAM, OUTLINE, 1.5);
      ellipse(c, 34.5, 25, 3.8, 5.6, '#4f6b34', OUTLINE, 1.5);
      ellipse(c, 22, 28, 13, 9, '#56743a', OUTLINE, 2);
      roundRect(c, 15, 22, 14, 13, 4, '#3d5228', '#1d2a12', 1.5);
      circle(c, 22, 17, 8.2, '#5f7d3d', OUTLINE, 2);
      line(c, 14.5, 18, 29.5, 18, TEAM, 2.6);
      ellipse(c, 20, 13.5, 3.4, 2, 'rgba(255,255,255,0.22)');
    },
  },
  {
    name: 'u2',
    w: 56,
    h: 56,
    draw: (c) => {
      shadow(c, 28, 45, 19, 7);
      roundRect(c, 36, 6, 9, 28, 3, '#2a2e33', OUTLINE, 1.5);
      line(c, 40.5, 1.5, 40.5, 9, '#7a828a', 4.5);
      roundRect(c, 34, 24, 13, 9, 2, '#556070', OUTLINE, 1.2);
      ellipse(c, 11.5, 34, 4.8, 6.8, '#3e5a2a', OUTLINE, 1.5);
      ellipse(c, 42, 31, 4.8, 6.8, '#3e5a2a', OUTLINE, 1.5);
      ellipse(c, 28, 35, 17, 12, '#46652f', OUTLINE, 2.5);
      roundRect(c, 20, 34, 16, 11, 3, '#5a4a2a', '#2a200e', 1.5);
      c.setLineDash([3, 2.5]);
      line(c, 14, 28, 40, 42, '#e8c34a', 3.5);
      c.setLineDash([]);
      circle(c, 28, 21, 10, '#506e34', OUTLINE, 2.5);
      line(c, 19.5, 23, 36.5, 23, TEAM, 3.2);
      ellipse(c, 25, 17, 4, 2.4, 'rgba(255,255,255,0.22)');
    },
  },
  {
    name: 'u3',
    w: 72,
    h: 96,
    draw: (c) => {
      shadow(c, 36, 86, 32, 9);
      for (const x of [4, 54]) {
        roundRect(c, x, 10, 14, 78, 5, '#24262a', OUTLINE, 2);
        for (let y = 14; y < 86; y += 6) line(c, x + 2, y, x + 12, y, '#3c4046', 2);
      }
      roundRect(c, 12, 6, 48, 84, 10, linear(c, 0, 6, 0, 90, [[0, '#7a8e48'], [1, '#4a5a2a']]), OUTLINE, 2.5);
      roundRect(c, 16, 7, 40, 14, 6, '#677a3a');
      for (let x = 20; x <= 52; x += 6) line(c, x, 76, x, 86, '#323a20', 2);
      polygon(c, [28, 66, 36, 60, 44, 66, 44, 71, 36, 65, 28, 71], TEAM, OUTLINE, 1.2);
      roundRect(c, 33, 0, 6, 42, 2, '#30381f', OUTLINE, 1.5);
      circle(c, 36, 44, 15, '#62763a', OUTLINE, 2.5);
      circle(c, 40, 48, 5, '#4a5a2a', OUTLINE, 1.5);
      ellipse(c, 31, 39, 6, 3.5, 'rgba(255,255,255,0.2)');
    },
  },
];

// ---------- zombies (facing down, toward the player) ----------

function zombieEyes(c: Ctx, x: number, y: number, gap: number, r: number): void {
  circle(c, x - gap, y, r * 1.9, 'rgba(255,48,70,0.25)');
  circle(c, x + gap, y, r * 1.9, 'rgba(255,48,70,0.25)');
  circle(c, x - gap, y, r, ZEYE);
  circle(c, x + gap, y, r, ZEYE);
}

const zombies: FrameSpec[] = [
  {
    name: 'z_walker',
    w: 40,
    h: 40,
    draw: (c) => {
      shadow(c, 20, 31, 13, 5);
      ellipse(c, 20, 19, 11, 8, '#4e4560', OUTLINE, 2);
      circle(c, 15, 17, 2, '#6a1220');
      circle(c, 25, 21, 1.6, '#6a1220');
      line(c, 11, 19, 12, 33, ZSKIN_DARK, 5);
      line(c, 29, 19, 28.5, 33, ZSKIN_DARK, 5);
      line(c, 11, 19, 12, 33, ZSKIN, 3);
      line(c, 29, 19, 28.5, 33, ZSKIN, 3);
      circle(c, 20, 23, 6.6, ZSKIN, OUTLINE, 1.5);
      zombieEyes(c, 20, 25, 2.4, 1.3);
    },
  },
  {
    name: 'z_runner',
    w: 40,
    h: 40,
    draw: (c) => {
      shadow(c, 20, 31, 12, 5);
      line(c, 12, 17, 7, 6, ZSKIN_DARK, 4.6);
      line(c, 28, 17, 33, 6, ZSKIN_DARK, 4.6);
      line(c, 12, 17, 7, 6, ZSKIN, 2.8);
      line(c, 28, 17, 33, 6, ZSKIN, 2.8);
      ellipse(c, 20, 18, 9, 7, '#8a2234', OUTLINE, 2);
      line(c, 15, 15, 24, 21, '#5a1020', 1.5);
      circle(c, 20, 25, 6, '#b0a2c6', OUTLINE, 1.5);
      zombieEyes(c, 20, 27, 2.2, 1.3);
    },
  },
  {
    name: 'z_brute',
    w: 72,
    h: 72,
    draw: (c) => {
      shadow(c, 36, 60, 26, 9);
      ellipse(c, 12, 40, 9, 15, ZSKIN_DARK, OUTLINE, 2);
      ellipse(c, 60, 40, 9, 15, ZSKIN_DARK, OUTLINE, 2);
      circle(c, 12, 55, 8, ZSKIN, OUTLINE, 2);
      circle(c, 60, 55, 8, ZSKIN, OUTLINE, 2);
      ellipse(c, 36, 34, 24, 18, '#43365a', OUTLINE, 2.5);
      ellipse(c, 30, 30, 9, 6, '#8a7aa8');
      line(c, 24, 26, 34, 34, '#2a1f33', 1.6);
      line(c, 40, 24, 50, 32, '#2a1f33', 1.6);
      polygon(c, [14, 26, 18, 16, 22, 24], '#c9c2b5', OUTLINE, 1.2);
      polygon(c, [50, 24, 54, 15, 58, 26], '#c9c2b5', OUTLINE, 1.2);
      circle(c, 36, 44, 9, ZSKIN, OUTLINE, 2);
      zombieEyes(c, 36, 46, 3.2, 1.7);
    },
  },
  {
    name: 'z_exploder',
    w: 52,
    h: 52,
    draw: (c) => {
      shadow(c, 26, 43, 18, 6);
      circle(c, 26, 25, 18, radial(c, 22, 21, 22, [[0, '#d9ec6a'], [0.6, '#98b83a'], [1, '#5f7a20']]), '#30400c', 2.5);
      const rand = seeded(3);
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        const d = 6 + rand() * 9;
        const x = 26 + Math.cos(a) * d;
        const y = 23 + Math.sin(a) * d;
        circle(c, x, y, 4.5, 'rgba(255,170,40,0.45)');
        circle(c, x, y, 2.6, '#ffe36a', '#d26a14', 1);
      }
      line(c, 9, 30, 6, 38, ZSKIN, 4);
      line(c, 43, 30, 46, 38, ZSKIN, 4);
      circle(c, 26, 39, 6, ZSKIN, OUTLINE, 1.5);
      zombieEyes(c, 26, 41, 2.2, 1.2);
    },
  },
];

// ---------- bosses ----------

function bossArms(c: Ctx, cx: number, top: number, spread: number, len: number, thick: number, skin: string, dark: string): void {
  ellipse(c, cx - spread, top + len / 2, thick, len / 2, dark, OUTLINE, 3);
  ellipse(c, cx + spread, top + len / 2, thick, len / 2, dark, OUTLINE, 3);
  circle(c, cx - spread, top + len, thick * 0.95, skin, OUTLINE, 3);
  circle(c, cx + spread, top + len, thick * 0.95, skin, OUTLINE, 3);
}

const bosses: FrameSpec[] = [
  {
    name: 'b_alpha',
    w: 150,
    h: 150,
    draw: (c) => {
      shadow(c, 75, 124, 52, 15);
      bossArms(c, 75, 52, 50, 56, 15, ZSKIN, ZSKIN_DARK);
      ellipse(c, 75, 68, 44, 34, '#3d2f4a', OUTLINE, 3);
      polygon(c, [40, 60, 75, 46, 110, 60, 104, 92, 46, 92], '#7a2230', OUTLINE, 2);
      line(c, 55, 64, 95, 84, '#2a1520', 3);
      for (const x of [36, 114]) polygon(c, [x - 10, 52, x, 28, x + 10, 52], '#c9c2b5', OUTLINE, 2);
      circle(c, 75, 88, 17, ZSKIN, OUTLINE, 3);
      for (let i = 0; i < 5; i++) polygon(c, [66 + i * 4.5, 74, 68 + i * 4.5, 62, 71 + i * 4.5, 74], '#d8283c');
      zombieEyes(c, 75, 92, 6, 3);
    },
  },
  {
    name: 'b_butcher',
    w: 190,
    h: 190,
    draw: (c) => {
      shadow(c, 95, 160, 64, 18);
      bossArms(c, 95, 66, 64, 70, 19, '#c8a6b4', '#9a7a8a');
      // Cleaver in the right hand.
      roundRect(c, 150, 130, 34, 52, 4, linear(c, 150, 0, 184, 0, [[0, '#d7dde2'], [1, '#8a939b']]), OUTLINE, 3);
      line(c, 159, 128, 159, 140, '#4a2a1a', 7);
      circle(c, 176, 172, 5, '#7a1020');
      ellipse(c, 95, 88, 58, 46, '#5a4058', OUTLINE, 3.5);
      roundRect(c, 58, 70, 74, 74, 14, '#d8d2c4', OUTLINE, 3);
      const rand = seeded(11);
      for (let i = 0; i < 9; i++) circle(c, 64 + rand() * 62, 76 + rand() * 62, 3 + rand() * 7, 'rgba(150,16,30,0.8)');
      line(c, 58, 76, 40, 60, '#3a3a3a', 4);
      circle(c, 95, 112, 21, '#c8a6b4', OUTLINE, 3);
      ellipse(c, 89, 104, 7, 4, 'rgba(255,255,255,0.25)');
      zombieEyes(c, 95, 117, 7, 3.4);
    },
  },
  {
    name: 'b_hulk',
    w: 230,
    h: 230,
    draw: (c) => {
      shadow(c, 115, 196, 80, 22);
      bossArms(c, 115, 70, 82, 100, 28, '#8a98b4', '#5e6b86');
      ellipse(c, 115, 98, 74, 56, linear(c, 0, 40, 0, 156, [[0, '#7b89a6'], [1, '#4c5770']]), OUTLINE, 4);
      ellipse(c, 88, 90, 22, 16, '#8f9dba');
      ellipse(c, 142, 90, 22, 16, '#8f9dba');
      c.globalAlpha = 0.9;
      line(c, 70, 70, 96, 116, '#c050ff', 3);
      line(c, 160, 70, 134, 120, '#c050ff', 3);
      line(c, 110, 60, 118, 130, '#c050ff', 2.5);
      c.globalAlpha = 1;
      for (let i = 0; i < 4; i++) line(c, 96 + i * 12, 130, 98 + i * 12, 150, '#e6e0d4', 4);
      circle(c, 115, 140, 17, '#9aa8c4', OUTLINE, 3);
      zombieEyes(c, 115, 144, 6, 3);
    },
  },
  {
    name: 'b_abomination',
    w: 230,
    h: 230,
    draw: (c) => {
      shadow(c, 115, 196, 84, 22);
      const rand = seeded(23);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + 0.7 * (i / 6));
        line(c, 115, 110, 115 + Math.cos(a) * 108, 110 + Math.sin(a) * 92, '#5a1d40', 13);
        line(c, 115, 110, 115 + Math.cos(a) * 108, 110 + Math.sin(a) * 92, '#9a3a6a', 7);
      }
      ellipse(c, 115, 100, 82, 66, radial(c, 105, 86, 90, [[0, '#b0487c'], [0.7, '#7a2a56'], [1, '#4a1434']]), OUTLINE, 4);
      for (let i = 0; i < 11; i++) {
        const x = 55 + rand() * 120;
        const y = 58 + rand() * 80;
        const r = 5 + rand() * 7;
        circle(c, x, y, r + 2, '#2a0a1c');
        circle(c, x, y, r, '#ffd84a');
        circle(c, x, y, r * 0.45, '#2a0a1c');
      }
      circle(c, 82, 140, 15, ZSKIN, OUTLINE, 3);
      circle(c, 148, 140, 15, ZSKIN, OUTLINE, 3);
      zombieEyes(c, 82, 143, 5, 2.6);
      zombieEyes(c, 148, 143, 5, 2.6);
    },
  },
  {
    name: 'b_queen',
    w: 220,
    h: 220,
    draw: (c) => {
      shadow(c, 110, 190, 70, 20);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        c.beginPath();
        c.moveTo(110, 96);
        c.quadraticCurveTo(110 + Math.cos(a) * 60, 96 + Math.sin(a) * 30 + 20, 110 + Math.cos(a) * 104, 96 + Math.sin(a) * 86);
        c.lineWidth = 7;
        c.strokeStyle = '#4a0f2c';
        c.stroke();
        c.lineWidth = 3.5;
        c.strokeStyle = '#d0408a';
        c.stroke();
      }
      ellipse(c, 60, 120, 42, 64, 'rgba(208,64,138,0.35)', '#7a1a4a', 2.5);
      ellipse(c, 160, 120, 42, 64, 'rgba(208,64,138,0.35)', '#7a1a4a', 2.5);
      ellipse(c, 110, 116, 40, 58, linear(c, 0, 60, 0, 174, [[0, '#8a2a5a'], [1, '#3a0a24']]), OUTLINE, 3.5);
      polygon(c, [86, 120, 92, 98, 100, 116, 110, 92, 120, 116, 128, 98, 134, 120], '#ffcf4a', OUTLINE, 2);
      circle(c, 110, 136, 18, '#c6a6d6', OUTLINE, 3);
      circle(c, 102, 139, 6, 'rgba(255,40,180,0.35)');
      circle(c, 118, 139, 6, 'rgba(255,40,180,0.35)');
      circle(c, 102, 139, 3, '#ff4ad8');
      circle(c, 118, 139, 3, '#ff4ad8');
    },
  },
];

// ---------- road props ----------

function car(body: string, roof: string): FrameSpec['draw'] {
  return (c) => {
    shadow(c, 42, 80, 42, 72, 0.4);
    for (const [x, y] of [[4, 26], [70, 26], [4, 106], [70, 106]]) roundRect(c, x, y, 10, 22, 3, '#151515');
    roundRect(c, 8, 6, 68, 140, 18, body, OUTLINE, 2.5);
    roundRect(c, 15, 30, 54, 24, 6, '#1d2830', OUTLINE, 1.5);
    line(c, 24, 34, 40, 48, 'rgba(200,220,230,0.5)', 1.2);
    line(c, 40, 34, 32, 50, 'rgba(200,220,230,0.4)', 1.2);
    roundRect(c, 17, 56, 50, 50, 8, roof, OUTLINE, 1.5);
    roundRect(c, 17, 108, 50, 18, 5, '#1d2830', OUTLINE, 1.5);
    const rand = seeded(body.length * 13);
    for (let i = 0; i < 7; i++) circle(c, 14 + rand() * 56, 10 + rand() * 130, 2 + rand() * 5, 'rgba(110,55,20,0.6)');
  };
}

const props: FrameSpec[] = [
  {
    name: 'gate',
    w: 280,
    h: 96,
    draw: (c) => {
      roundRect(c, 4, 4, 272, 88, 20, linear(c, 0, 4, 0, 92, [[0, 'rgba(255,255,255,0.92)'], [1, 'rgba(255,255,255,0.5)']]), '#fff', 6);
      roundRect(c, 14, 12, 252, 18, 9, 'rgba(255,255,255,0.35)');
    },
  },
  {
    name: 'post',
    w: 20,
    h: 120,
    draw: (c) => {
      roundRect(c, 4, 6, 12, 112, 4, linear(c, 4, 0, 16, 0, [[0, '#b7c0ca'], [1, '#59616a']]), OUTLINE, 1.5);
      circle(c, 10, 8, 7, '#d6dde4', OUTLINE, 1.5);
    },
  },
  {
    name: 'sandbags',
    w: 72,
    h: 44,
    draw: (c) => {
      shadow(c, 36, 36, 34, 7);
      for (const x of [14, 36, 58]) ellipse(c, x, 16, 12, 9, '#a68c58', '#4e3c1c', 2);
      for (const x of [25, 47]) ellipse(c, x, 28, 13, 9.5, '#bba06a', '#4e3c1c', 2);
    },
  },
  {
    name: 'planks',
    w: 72,
    h: 44,
    draw: (c) => {
      shadow(c, 36, 36, 34, 7);
      roundRect(c, 2, 14, 68, 12, 3, '#8a5a32', '#3a220e', 2);
      c.save();
      c.translate(36, 22);
      c.rotate(0.38);
      roundRect(c, -34, -6, 68, 11, 3, '#9a6a3c', '#3a220e', 2);
      c.rotate(-0.76);
      roundRect(c, -34, -6, 68, 11, 3, '#a8784a', '#3a220e', 2);
      c.restore();
      for (const x of [10, 36, 62]) circle(c, x, 20, 1.8, '#c8c8c8');
    },
  },
  { name: 'car', w: 84, h: 150, draw: car('#8a4f2c', '#9c6038') },
  { name: 'car2', w: 84, h: 150, draw: car('#3d5a73', '#4d6c86') },
  {
    name: 'barrel',
    w: 34,
    h: 34,
    draw: (c) => {
      circle(c, 17, 17, 15, radial(c, 13, 13, 18, [[0, '#d8743a'], [1, '#8a3a16']]), OUTLINE, 2);
      circle(c, 17, 17, 10, 'rgba(0,0,0,0)', '#5a2408', 2);
      circle(c, 21, 13, 2.5, '#3a1a08');
    },
  },
  {
    name: 'tire',
    w: 30,
    h: 30,
    draw: (c) => {
      circle(c, 15, 15, 13, '#1b1b1b', '#000', 1.5);
      circle(c, 15, 15, 6, '#3a3a3a');
      circle(c, 15, 15, 2.5, '#777');
    },
  },
  {
    name: 'crack',
    w: 96,
    h: 96,
    draw: (c) => {
      const rand = seeded(5);
      c.strokeStyle = 'rgba(8,8,8,0.6)';
      c.lineCap = 'round';
      for (let b = 0; b < 4; b++) {
        let x = 48;
        let y = 48;
        let a = rand() * Math.PI * 2;
        c.beginPath();
        c.moveTo(x, y);
        for (let i = 0; i < 6; i++) {
          a += (rand() - 0.5) * 1.2;
          x += Math.cos(a) * 8;
          y += Math.sin(a) * 8;
          c.lineTo(x, y);
        }
        c.lineWidth = 2;
        c.stroke();
      }
    },
  },
  {
    name: 'manhole',
    w: 52,
    h: 52,
    draw: (c) => {
      circle(c, 26, 26, 23, '#3a3d40', '#1a1c1e', 3);
      for (let i = -2; i <= 2; i++) line(c, 12, 26 + i * 6, 40, 26 + i * 6, '#2a2c2e', 2);
    },
  },
  {
    name: 'grass',
    w: 40,
    h: 30,
    draw: (c) => {
      const rand = seeded(9);
      for (let i = 0; i < 9; i++) {
        const x = 6 + rand() * 28;
        line(c, x, 28, x + (rand() - 0.5) * 12, 6 + rand() * 10, i % 2 ? '#3f5e2a' : '#2f4a20', 2.5);
      }
    },
  },
  {
    name: 'bones',
    w: 40,
    h: 24,
    draw: (c) => {
      line(c, 6, 18, 30, 6, '#d9d2c2', 4);
      for (const [x, y] of [[6, 18], [30, 6]]) {
        circle(c, x - 2, y - 1, 3, '#d9d2c2');
        circle(c, x + 1, y + 2, 3, '#d9d2c2');
      }
      circle(c, 33, 17, 5, '#e6dfcf', '#6a6050', 1);
    },
  },
  {
    name: 'crate',
    w: 48,
    h: 48,
    draw: (c) => {
      shadow(c, 24, 42, 20, 5);
      roundRect(c, 4, 4, 40, 38, 4, '#8a6236', '#3a2410', 2.5);
      line(c, 6, 8, 42, 40, '#6a4826', 4);
      line(c, 42, 8, 6, 40, '#6a4826', 4);
      roundRect(c, 4, 18, 40, 9, 2, TEAM, TEAM_DARK, 1.5);
    },
  },
];

// ---------- icons (white, tinted where used) ----------

function cutout(c: Ctx, draw: () => void): void {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  draw();
  c.restore();
}

function gearPath(c: Ctx, cx: number, cy: number, teeth: number, outer: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    const a0 = a - Math.PI / (teeth * 2) * 0.6;
    const a1 = a + Math.PI / (teeth * 2) * 0.6;
    c.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    c.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
  }
  c.closePath();
}

function star(c: Ctx, cx: number, cy: number, outer: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.closePath();
}

const W = '#fff';

const icons: FrameSpec[] = [
  {
    name: 'i_people',
    w: 48,
    h: 48,
    draw: (c) => {
      for (const [x, s] of [[12, 0.8], [36, 0.8], [24, 1]] as const) {
        circle(c, x, 16 + (1 - s) * 6, 7 * s, W);
        roundRect(c, x - 10 * s, 26 + (1 - s) * 5, 20 * s, 18 * s, 8 * s, W);
      }
    },
  },
  {
    name: 'i_skull',
    w: 48,
    h: 48,
    draw: (c) => {
      circle(c, 24, 21, 17, W);
      roundRect(c, 14, 28, 20, 14, 4, W);
      cutout(c, () => {
        circle(c, 17.5, 22, 5, '#000');
        circle(c, 30.5, 22, 5, '#000');
        polygon(c, [24, 27, 21, 32, 27, 32], '#000');
        for (const x of [19, 24, 29]) roundRect(c, x - 1, 36, 2, 6, 1, '#000');
      });
    },
  },
  {
    name: 'i_boss',
    w: 48,
    h: 48,
    draw: (c) => {
      polygon(c, [6, 4, 16, 16, 10, 20], W);
      polygon(c, [42, 4, 32, 16, 38, 20], W);
      circle(c, 24, 24, 15, W);
      roundRect(c, 15, 30, 18, 12, 4, W);
      cutout(c, () => {
        polygon(c, [14, 21, 22, 24, 15, 28], '#000');
        polygon(c, [34, 21, 26, 24, 33, 28], '#000');
        for (const x of [19, 24, 29]) roundRect(c, x - 1, 36, 2, 6, 1, '#000');
      });
    },
  },
  {
    name: 'i_pause',
    w: 48,
    h: 48,
    draw: (c) => {
      roundRect(c, 12, 10, 9, 28, 3, W);
      roundRect(c, 27, 10, 9, 28, 3, W);
    },
  },
  { name: 'i_play', w: 48, h: 48, draw: (c) => polygon(c, [14, 8, 40, 24, 14, 40], W) },
  {
    name: 'i_scrap',
    w: 48,
    h: 48,
    draw: (c) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        c.lineTo(24 + Math.cos(a) * 20, 24 + Math.sin(a) * 20);
      }
      c.closePath();
      c.fillStyle = W;
      c.fill();
      cutout(c, () => circle(c, 24, 24, 8, '#000'));
    },
  },
  {
    name: 'i_gear',
    w: 48,
    h: 48,
    draw: (c) => {
      gearPath(c, 24, 24, 8, 21, 15);
      c.fillStyle = W;
      c.fill();
      cutout(c, () => circle(c, 24, 24, 7, '#000'));
    },
  },
  {
    name: 'i_food',
    w: 48,
    h: 48,
    draw: (c) => {
      roundRect(c, 10, 12, 28, 30, 4, W);
      ellipse(c, 24, 12, 14, 5, W);
      cutout(c, () => {
        roundRect(c, 10, 22, 28, 3, 0, '#000');
        roundRect(c, 10, 32, 28, 3, 0, '#000');
      });
    },
  },
  {
    name: 'i_fuel',
    w: 48,
    h: 48,
    draw: (c) => {
      polygon(c, [10, 14, 26, 14, 38, 22, 38, 44, 10, 44], W);
      roundRect(c, 28, 4, 8, 10, 2, W);
      roundRect(c, 12, 6, 14, 6, 3, W);
      cutout(c, () => {
        line(c, 16, 22, 32, 38, '#000', 3);
        line(c, 32, 22, 16, 38, '#000', 3);
      });
    },
  },
  {
    name: 'i_star',
    w: 48,
    h: 48,
    draw: (c) => {
      star(c, 24, 25, 22, 9.5);
      c.fillStyle = W;
      c.fill();
    },
  },
  {
    name: 'i_lock',
    w: 48,
    h: 48,
    draw: (c) => {
      c.beginPath();
      c.arc(24, 20, 10, Math.PI, 0);
      c.lineWidth = 5;
      c.strokeStyle = W;
      c.stroke();
      line(c, 14, 20, 14, 24, W, 5);
      line(c, 34, 20, 34, 24, W, 5);
      roundRect(c, 8, 22, 32, 22, 5, W);
      cutout(c, () => roundRect(c, 22, 28, 4, 9, 2, '#000'));
    },
  },
  {
    name: 'i_sound',
    w: 48,
    h: 48,
    draw: (c) => {
      polygon(c, [6, 18, 14, 18, 24, 8, 24, 40, 14, 30, 6, 30], W);
      for (const r of [8, 15]) {
        c.beginPath();
        c.arc(26, 24, r, -0.9, 0.9);
        c.lineWidth = 4;
        c.strokeStyle = W;
        c.lineCap = 'round';
        c.stroke();
      }
    },
  },
  {
    name: 'i_vibe',
    w: 48,
    h: 48,
    draw: (c) => {
      roundRect(c, 15, 6, 18, 36, 4, W);
      cutout(c, () => roundRect(c, 18, 10, 12, 26, 2, '#000'));
      for (const s of [-1, 1]) {
        line(c, 24 + s * 14, 14, 24 + s * 14, 34, W, 3);
        line(c, 24 + s * 20, 18, 24 + s * 20, 30, W, 3);
      }
    },
  },
  {
    name: 'i_shake',
    w: 48,
    h: 48,
    draw: (c) => {
      roundRect(c, 12, 12, 24, 24, 4, W);
      for (const s of [-1, 1]) {
        line(c, 24 + s * 18, 14, 24 + s * 18, 34, W, 3);
        line(c, 24 + s * 18, 14, 24 + s * 18, 34, W, 3);
      }
      line(c, 14, 6, 34, 6, W, 3);
      line(c, 14, 42, 34, 42, W, 3);
    },
  },
  {
    name: 'i_home',
    w: 48,
    h: 48,
    draw: (c) => {
      polygon(c, [24, 4, 44, 22, 38, 22, 38, 44, 10, 44, 10, 22, 4, 22], W);
      cutout(c, () => roundRect(c, 19, 28, 10, 16, 2, '#000'));
    },
  },
  { name: 'i_left', w: 48, h: 48, draw: (c) => polygon(c, [30, 6, 36, 12, 24, 24, 36, 36, 30, 42, 12, 24], W) },
  { name: 'i_right', w: 48, h: 48, draw: (c) => polygon(c, [18, 6, 36, 24, 18, 42, 12, 36, 24, 24, 12, 12], W) },
  { name: 'i_up', w: 48, h: 48, draw: (c) => polygon(c, [24, 4, 44, 24, 32, 24, 32, 44, 16, 44, 16, 24, 4, 24], W) },
  { name: 'i_check', w: 48, h: 48, draw: (c) => polygon(c, [6, 24, 12, 18, 20, 26, 38, 8, 44, 14, 20, 38], W) },
  {
    name: 'i_clock',
    w: 48,
    h: 48,
    draw: (c) => {
      circle(c, 24, 24, 20, W);
      cutout(c, () => {
        line(c, 24, 24, 24, 12, '#000', 4);
        line(c, 24, 24, 33, 28, '#000', 4);
      });
    },
  },
  {
    name: 'i_flag',
    w: 48,
    h: 48,
    draw: (c) => {
      line(c, 12, 6, 12, 44, W, 4);
      polygon(c, [14, 6, 40, 12, 14, 24], W);
    },
  },
  {
    name: 'i_ad',
    w: 48,
    h: 48,
    draw: (c) => {
      roundRect(c, 4, 10, 40, 28, 7, W);
      cutout(c, () => polygon(c, [19, 16, 32, 24, 19, 32], '#000'));
    },
  },
  {
    name: 'i_cart',
    w: 48,
    h: 48,
    draw: (c) => {
      polygon(c, [4, 8, 12, 8, 16, 30, 40, 30, 44, 14, 14, 14, 13, 8], W);
      circle(c, 18, 38, 4, W);
      circle(c, 36, 38, 4, W);
    },
  },
  {
    name: 'i_hand',
    w: 64,
    h: 64,
    draw: (c) => {
      const hand = () => {
        roundRect(c, 24, 4, 12, 34, 6, '#fff');
        roundRect(c, 14, 26, 36, 30, 12, '#fff');
        roundRect(c, 36, 22, 10, 18, 5, '#fff');
        roundRect(c, 46, 26, 9, 16, 4, '#fff');
      };
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = 6;
      c.lineWidth = 6;
      c.strokeStyle = '#222';
      hand();
      c.restore();
      hand();
    },
  },
];

// ---------- Korean words drawn as pictures, so popups stay in the atlas batch ----------

function word(name: string, text: string, size: number, w: number, h: number): FrameSpec {
  return {
    name,
    w,
    h,
    draw: (c) => {
      c.font = `900 ${size}px ${FONT_FAMILY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = Math.max(6, size * 0.16);
      c.strokeStyle = '#120c14';
      c.strokeText(text, w / 2, h / 2 + size * 0.04, w - 8);
      c.fillStyle = '#fff';
      c.fillText(text, w / 2, h / 2 + size * 0.04, w - 8);
    },
  };
}

const words: FrameSpec[] = [
  word('w_merge', '합체!', 64, 200, 84),
  word('w_split', '분해!', 64, 200, 84),
  word('w_smash', '돌파!', 64, 200, 84),
  word('w_boss', '보스 출현', 72, 360, 96),
  word('w_win', '승리!', 96, 280, 120),
  word('w_lose', '전멸', 96, 280, 120),
  word('g_merge', '합체', 52, 150, 70),
  word('g_split', '분해', 52, 150, 70),
];

export const FRAMES: readonly FrameSpec[] = [...basics, ...allies, ...zombies, ...bosses, ...props, ...icons, ...words];

/** Frame names by sim tier index and by zombie/boss kind id. */
export const UNIT_FRAMES = ['u0', 'u1', 'u2', 'u3'] as const;
export const zombieFrame = (kind: string) => `z_${kind}`;
export const bossFrame = (kind: string) => `b_${kind}`;
