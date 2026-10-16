import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { seeded } from '../art/draw';
import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT, ROAD_WIDTH } from '../sim/types';
import { Depth } from './depth';

const DASH_GAP = 160;
const PROP_COUNT = 26;

interface Prop {
  img: Phaser.GameObjects.Image;
  x: number;
  z: number;
}

const SIDE_PROPS = ['car', 'car2', 'barrel', 'tire', 'grass', 'grass', 'bones', 'barrel'];
const ROAD_PROPS = ['crack', 'crack', 'manhole', 'tire', 'bones'];

/**
 * The scrolling road: asphalt, lane dashes and roadside wrecks, all atlas images moved each frame
 * (no Graphics redraws). Props are recycled ahead of the crowd as they leave the bottom of the screen.
 */
export class Track {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly asphalt: Phaser.GameObjects.Image;
  private readonly edgeL: Phaser.GameObjects.Image;
  private readonly edgeR: Phaser.GameObjects.Image;
  private readonly dashes: Phaser.GameObjects.Image[] = [];
  private readonly props: Prop[] = [];
  private readonly rand: () => number;
  private nextZ = -400;
  private height = 1280;

  constructor(scene: Phaser.Scene, seed: number) {
    this.rand = seeded(seed * 977 + 13);
    this.bg = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x1d2617).setDepth(Depth.Ground);
    this.asphalt = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0.5, 0).setTint(0x2d302c).setDepth(Depth.Ground);
    this.edgeL = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0.5, 0).setTint(0x8d9288).setDepth(Depth.Ground);
    this.edgeR = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0.5, 0).setTint(0x8d9288).setDepth(Depth.Ground);
    for (let i = 0; i < 12; i++) {
      this.dashes.push(scene.add.image(0, 0, ATLAS, 'dash').setTint(0xd8cf96).setAlpha(0.55).setDepth(Depth.RoadMarks));
    }
    for (let i = 0; i < PROP_COUNT; i++) {
      const img = scene.add.image(0, 0, ATLAS, 'crack').setDepth(Depth.RoadMarks);
      const prop = { img, x: 0, z: 0 };
      this.place(prop);
      this.props.push(prop);
    }
  }

  layout(width: number, height: number, roadX: number): void {
    this.height = height;
    this.bg.setDisplaySize(width, height);
    this.asphalt.setPosition(roadX + ROAD_CENTER, 0).setDisplaySize(ROAD_WIDTH, height);
    this.edgeL.setPosition(roadX + ROAD_LEFT, 0).setDisplaySize(6, height);
    this.edgeR.setPosition(roadX + ROAD_RIGHT, 0).setDisplaySize(6, height);
  }

  update(distance: number, roadX: number, crowdY: number): void {
    const offset = distance % DASH_GAP;
    for (let i = 0; i < this.dashes.length; i++) {
      this.dashes[i].setPosition(roadX + ROAD_CENTER, (i - 1) * DASH_GAP + offset);
    }
    for (const p of this.props) {
      let y = crowdY - (p.z - distance);
      if (y > this.height + 160) {
        this.place(p);
        y = crowdY - (p.z - distance);
      }
      p.img.setPosition(roadX + p.x, y);
    }
  }

  private place(p: Prop): void {
    const r = this.rand;
    this.nextZ += 110 + r() * 170;
    p.z = this.nextZ;
    if (r() < 0.62) {
      const frame = SIDE_PROPS[Math.floor(r() * SIDE_PROPS.length)];
      const left = r() < 0.5;
      const big = frame === 'car' || frame === 'car2';
      const edge = big ? 22 + r() * 18 : 8 + r() * 40;
      p.x = left ? edge : ROAD_RIGHT + ROAD_LEFT - edge;
      p.img
        .setFrame(frame)
        .setScale(big ? 0.75 : 0.9 + r() * 0.3)
        .setRotation(big ? (r() - 0.5) * 0.9 : r() * Math.PI * 2)
        .setAlpha(1)
        .setDepth(big ? Depth.Props : Depth.RoadMarks);
    } else {
      const frame = ROAD_PROPS[Math.floor(r() * ROAD_PROPS.length)];
      p.x = ROAD_LEFT + 40 + r() * (ROAD_WIDTH - 80);
      p.img
        .setFrame(frame)
        .setScale(0.8 + r() * 0.5)
        .setRotation(r() * Math.PI * 2)
        .setAlpha(frame === 'crack' ? 0.8 : 0.75)
        .setDepth(Depth.RoadMarks);
    }
  }
}
