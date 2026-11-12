// 地面材质：环形铺设的抛光石板、金属嵌条、灯槽，以及随粗糙度变模糊的实时倒影。
import { Color, Matrix4, type MeshPhysicalMaterial, type Texture } from 'three'
import { palette } from '../scene/layout'
import { surfaceMaterial, type SurfaceExtension } from './surface'

/** 石板按同心环铺设：每一环的外半径和分块数。金属嵌条在第二环外沿，暖色灯槽在第三环外沿。 */
export const FLOOR_INLAY_RADIUS = 4.7
export const FLOOR_LED_RADIUS = 6.7

const pars = /* glsl */ `
  uniform sampler2D uMirrorMap;
  uniform mat4 uMirrorMatrix;
  uniform float uMirrorStrength;
  uniform vec3 uLedColor;
  float floorSeam;
  float floorTile;
  float floorInlay;
  float floorLed;
  float floorRadius;
  float floorHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  void floorPattern(vec2 p) {
    float r = length(p);
    float inner = 0.0;
    float outer = 2.4;
    float count = 8.0;
    float index = 0.0;
    if (r > 2.4) { inner = 2.4; outer = 4.7; count = 16.0; index = 1.0; }
    if (r > 4.7) { inner = 4.7; outer = 6.7; count = 24.0; index = 2.0; }
    if (r > 6.7) { inner = 6.7; outer = 8.6; count = 32.0; index = 3.0; }
    if (r > 8.6) { inner = 8.6; outer = 12.0; count = 48.0; index = 4.0; }
    float sector = (atan(p.y, p.x) / 6.28318530718 + 0.5) * count + index * 0.37;
    float toJoint = (0.5 - abs(fract(sector) - 0.5)) / count * 6.28318530718 * r;
    float gap = min(toJoint, min(r - inner, outer - r));
    floorSeam = 1.0 - smoothstep(0.0015, 0.004 + fwidth(r) * 1.2, gap);
    floorTile = floorHash(vec2(floor(sector), index));
    float soft = fwidth(r);
    floorInlay = 1.0 - smoothstep(0.024, 0.026 + soft, abs(r - ${FLOOR_INLAY_RADIUS.toFixed(2)}));
    floorLed = 1.0 - smoothstep(0.009, 0.011 + soft, abs(r - ${FLOOR_LED_RADIUS.toFixed(2)}));
    floorRadius = r;
  }
`

const extension: SurfaceExtension = {
  key: 'floor',
  pars,
  albedo: /* glsl */ `
    floorPattern(vSurfPos.xz);
    diffuseColor.rgb *= 0.82 + floorTile * 0.36;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008), floorSeam * (1.0 - floorInlay));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.55, 0.58), floorInlay);
    // 灯槽本身，以及它洒在两侧石板上的一点光。
    totalEmissiveRadiance += uLedColor * (floorLed * 4.0 + exp(-abs(floorRadius - ${FLOOR_LED_RADIUS.toFixed(2)}) * 9.0) * 0.035);
  `,
  roughness: /* glsl */ `
    roughnessFactor = clamp(roughnessFactor + (floorTile - 0.5) * 0.1, 0.04, 1.0);
    roughnessFactor = mix(roughnessFactor, 0.9, floorSeam);
    roughnessFactor = mix(roughnessFactor, 0.3, floorInlay);
  `,
  metalness: /* glsl */ `
    metalnessFactor = mix(metalnessFactor, 1.0, floorInlay);
  `,
  // 倒影强度随视角变化（越平视越强），粗糙处取更模糊的一级。
  output: /* glsl */ `
    {
      vec3 toEye = normalize(cameraPosition - vSurfPos);
      float facing = clamp(toEye.y, 0.0, 1.0);
      float base = mix(0.07, 0.62, floorInlay);
      float fresnel = base + (1.0 - base) * pow(1.0 - facing, 5.0);
      vec4 projected = uMirrorMatrix * vec4(vSurfPos, 1.0);
      vec2 mirrorUv = projected.xy / projected.w + surfBend.xz * 0.02;
      vec3 mirrored = textureLod(uMirrorMap, mirrorUv, roughnessFactor * 8.0).rgb;
      outgoingLight += mirrored * fresnel * uMirrorStrength * (1.0 - floorSeam) * (1.0 - roughnessFactor * 0.6);
    }
  `,
}

export interface FloorMaterial {
  material: MeshPhysicalMaterial
  /** 每帧由管线回填倒影；texture 为 null 时关闭倒影，改用环境反射兜底。 */
  setMirror: (texture: Texture | null, matrix: Matrix4) => void
}

export function createFloorMaterial(stone: Texture): FloorMaterial {
  const uniforms = {
    uMirrorMap: { value: null as Texture | null },
    uMirrorMatrix: { value: new Matrix4() },
    uMirrorStrength: { value: 0 },
    uLedColor: { value: new Color(palette.warm) },
  }
  const material = surfaceMaterial(
    { color: 0x1b2026, metalness: 0, roughness: 0.14, envMapIntensity: 1 },
    { map: stone, scale: 0.42, bump: 0.12, rough: 0.16, tint: 0.85 },
    { ...extension, uniforms },
  )
  return {
    material,
    setMirror: (texture, matrix) => {
      uniforms.uMirrorMap.value = texture
      uniforms.uMirrorMatrix.value.copy(matrix)
      uniforms.uMirrorStrength.value = texture ? 1 : 0
      material.envMapIntensity = texture ? 0.12 : 1
    },
  }
}
