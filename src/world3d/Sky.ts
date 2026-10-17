import * as THREE from 'three';

const VERT = /* glsl */ `
varying float vY;
void main() {
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uTop;
uniform vec3 uGlow;
varying float vY;
void main() {
  vec3 c = mix(uHorizon, uTop, smoothstep(250.0, 2600.0, vY));
  // Fires on the horizon light the haze from below.
  c += uGlow * (1.0 - smoothstep(0.0, 1100.0, vY)) * 0.28;
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * A backdrop just past the fog: the haze color at the horizon darkening upward, with a fire glow
 * along the bottom. One quad that travels with the camera.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly horizon = new THREE.Color();
  private readonly top = new THREE.Color();
  private readonly cool = new THREE.Color(0x1a1830);

  constructor(scene: THREE.Scene, private readonly distance: number) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHorizon: { value: this.horizon },
        uTop: { value: this.top },
        uGlow: { value: new THREE.Color(0xff6a20) },
      },
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(12000, 6000), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  /** Matches the fog: the horizon is the fog color, the top a darker, cooler shade of it. */
  setColor(fog: THREE.Color): void {
    this.horizon.copy(fog);
    this.top.copy(fog).multiplyScalar(0.42).lerp(this.cool, 0.25);
  }

  /** Keeps the backdrop straight ahead of the camera, its bottom below the ground. */
  follow(x: number, z: number): void {
    this.mesh.position.set(x, 2400, z - this.distance);
    this.mesh.updateMatrix();
  }
}
