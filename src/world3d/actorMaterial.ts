import * as THREE from 'three';

/**
 * Unlit vertex-colored material for instanced actors, patched to animate on the GPU from two
 * attributes:
 * - `aLimb` (per vertex): limb kind, pivot y, pivot z, side (+1 left, -1 right).
 * - `iData` (per instance): walk cycle angle, swing amount (0 when standing), white hit flash 0..1,
 *   brightness (corpses are darker).
 * Legs swing in opposite phase, arms against the legs, zombie arms claw, heads nod. Positive angles
 * swing a hanging limb forward (-z).
 */
export function actorMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aLimb;
attribute vec4 iData;
varying float vFlash;
varying float vShade;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFlash = iData.z;
vShade = iData.w;
float limbKind = aLimb.x;
if (limbKind > 0.5) {
  float swing = sin(iData.x) * iData.y;
  float a = 0.0;
  if (limbKind < 1.5) a = swing * aLimb.w;
  else if (limbKind < 2.5) a = -swing * aLimb.w * 0.8;
  else if (limbKind < 3.5) a = sin(iData.x * 0.5 + aLimb.w * 1.3) * (0.12 + iData.y * 0.25);
  else a = sin(iData.x * 2.0) * 0.06 * iData.y;
  vec2 p = transformed.yz - aLimb.yz;
  float c = cos(a);
  float s = sin(a);
  transformed.yz = aLimb.yz + vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vFlash;
varying float vShade;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb * vShade, vec3(1.0, 0.98, 0.92), vFlash);`,
      );
  };
  // All actor materials compile to the same program.
  material.customProgramCacheKey = () => 'actor';
  return material;
}
