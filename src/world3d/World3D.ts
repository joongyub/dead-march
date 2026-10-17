import Phaser from 'phaser';
import * as THREE from 'three';
import { Depth } from '../battle/depth';
import { quality } from '../core/quality';
import { flags } from '../platform/flags';
import { sharedContext } from './context';

/** Screen position of a world point in game units, and how many game units one world unit spans there. */
export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
}

// Colors are authored as plain sRGB hex values and written to the screen as they are.
THREE.ColorManagement.enabled = false;

/** The camera sits this far behind and above the army and looks this far ahead of it. */
const CAM_BACK = 470;
const CAM_UP = 640;
const LOOK_AHEAD = 560;
/** Horizontal field of view stays fixed, so taller phones see more road instead of a narrower one. */
const H_FOV = 40;
/** How much the camera follows the army sideways (0 = fixed on the road center). */
const FOLLOW_X = 0.5;
const ROAD_CENTER = 360;

const tmp = new THREE.Vector3();

/**
 * Three.js world drawn inside Phaser's own WebGL2 context, under the 2D HUD. One renderer, one
 * camera and one scene for the whole game; battles add and reset their objects instead of creating
 * new ones, so nothing leaks between battles and shaders compile once.
 *
 * Phaser draws the scene through an Extern game object at the bottom of the battle's display list:
 * the camera background (sky color) first, then this world, then the HUD on top.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 9 / 16, 30, 7000);
  readonly fog: THREE.Fog;
  private width = 1;
  private height = 1;
  private readonly viewProj = new THREE.Matrix4();
  /** Camera shake: trauma decays; the offset grows with its square. */
  private trauma = 0;
  private shakeTime = 0;
  /** Extra field of view that springs back (hard hits punch the camera). */
  private fovKick = 0;
  private baseFov = 60;
  private camX = ROAD_CENTER;
  shakeEnabled = true;

  constructor(private readonly game: Phaser.Game, gl: WebGL2RenderingContext) {
    // Phaser leaves these on after its uploads; Three.js creates 3D textures on start, which refuse them.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.renderer = new THREE.WebGLRenderer({ canvas: game.canvas, context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.info.autoReset = true;
    // Reading shader logs waits on the GPU; only worth it while developing.
    this.renderer.debug.checkShaderErrors = flags.debug || import.meta.env.DEV;
    this.fog = new THREE.Fog(0x9a7a80, 1300, 3400);
    this.scene.fog = this.fog;
    this.scene.matrixWorldAutoUpdate = true;
  }

  /** Draws this world as part of a Phaser scene, below everything else in it. */
  attach(scene: Phaser.Scene): Phaser.GameObjects.Extern {
    const extern = scene.add.extern();
    extern.setDepth(Depth.World);
    (extern as unknown as { render: () => void }).render = () => this.render();
    return extern;
  }

  setFogColor(hex: number): void {
    this.fog.color.setHex(hex);
  }

  /** Adds trauma (0..1); bigger hits shake harder, several in a row stack up to the limit. */
  shake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Widens the view for an instant (big explosions, merges). */
  punch(degrees: number): void {
    if (!this.shakeEnabled) return;
    this.fovKick = Math.max(this.fovKick, degrees);
  }

  /** Places the camera behind the army at road position (crowdX, distance). */
  follow(dt: number, crowdX: number, distance: number): void {
    const targetX = ROAD_CENTER + (crowdX - ROAD_CENTER) * FOLLOW_X;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 6);
    let sx = 0;
    let sy = 0;
    let rz = 0;
    if (this.trauma > 0) {
      this.shakeTime += dt;
      const t = this.trauma * this.trauma;
      const k = this.shakeTime * 38;
      sx = (Math.sin(k * 1.3) + Math.sin(k * 2.9) * 0.5) * 16 * t;
      sy = (Math.sin(k * 1.7 + 1) + Math.sin(k * 3.3) * 0.5) * 12 * t;
      rz = Math.sin(k * 1.1 + 2) * 0.025 * t;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    const z = -distance;
    this.camera.position.set(this.camX + sx, CAM_UP + sy, z + CAM_BACK);
    tmp.set(this.camX + (crowdX - this.camX) * 0.25 + sx * 0.5, 0, z - LOOK_AHEAD);
    this.camera.lookAt(tmp);
    if (rz !== 0) this.camera.rotateZ(rz);
    if (this.fovKick > 0.01) {
      this.fovKick *= Math.exp(-dt * 7);
    } else {
      this.fovKick = 0;
    }
    const fov = this.baseFov + this.fovKick;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
  }

  /** Snaps the camera into place (start of a battle). */
  reset(crowdX: number, distance: number): void {
    this.trauma = 0;
    this.fovKick = 0;
    this.camX = ROAD_CENTER + (crowdX - ROAD_CENTER) * FOLLOW_X;
    this.follow(0, crowdX, distance);
  }

  /** Canvas size changed (rotation, low-spec mode): keep the horizontal view and fix the aspect. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const aspect = width / height;
    this.baseFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(H_FOV / 2)) / aspect));
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov + this.fovKick;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Projects a world point to the screen in game units (what Phaser layouts use). Returns false for
   * points behind the camera.
   */
  project(x: number, y: number, z: number, out: ScreenPoint): boolean {
    const e = this.viewProj.elements;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 1) return false;
    const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
    const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    const s = quality.renderScale;
    out.x = ((nx + 1) / 2) * (this.width / s);
    out.y = ((1 - ny) / 2) * (this.height / s);
    // One world unit at this depth, in game units (the projection's y scale over depth).
    out.scale = ((this.camera.projectionMatrix.elements[5] / w) * (this.height / s)) / 2;
    return true;
  }

  /** Compiles every shader the scene uses now, so no battle frame stalls when something first appears. */
  warmUp(): void {
    // compile() and render() skip hidden and off-screen objects, and empty pools are hidden.
    const hidden: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    const r = this.renderer;
    r.resetState();
    r.compile(this.scene, this.camera);
    // Shaders are only linked and checked at their first draw, so draw everything once into one pixel.
    r.setViewport(0, 0, 1, 1);
    r.setScissor(0, 0, 1, 1);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    r.resetState();
  }

  private render(): void {
    const canvas = this.game.canvas;
    if (canvas.width !== this.width || canvas.height !== this.height) this.resize(canvas.width, canvas.height);
    const r = this.renderer;
    r.resetState();
    r.setViewport(0, 0, this.width, this.height);
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.resetState();
  }
}

let world: World3D | null = null;

/** The one 3D world, or null on devices without WebGL2. */
export function getWorld(game: Phaser.Game): World3D | null {
  const gl = sharedContext();
  if (!world && gl) world = new World3D(game, gl);
  return world;
}
