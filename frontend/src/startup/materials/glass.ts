// 落地窗玻璃：透过它看到被雨水折射、被水汽柔化的城市，同时映出室内的灯光。
import { Color, ShaderMaterial, Vector2, type CubeTexture, type Texture } from 'three'
import { room } from '../scene/layout'

const glassVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// 雨水分三层：两层沿玻璃下滑、拖着水痕的大水珠，加一层不动的细小水珠。
// 每层返回 (折射偏移 xy, 湿润程度)：水珠像小透镜一样把背后的画面缩小倒置，水痕则擦掉玻璃上的水汽。
const rainGlsl = /* glsl */ `
  float rainHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  vec3 slidingDrops(vec2 uv, float time, vec2 cell, float density) {
    vec2 st = uv / cell;
    float column = floor(st.x);
    float columnRoll = rainHash(vec2(column, 3.7));
    st.y += columnRoll * 13.7 + time * (0.3 + columnRoll * 0.45);
    vec2 id = vec2(column, floor(st.y));
    vec2 f = fract(st);
    float rollA = rainHash(id);
    float rollB = rainHash(id + 31.7);
    if (rollA > density) return vec3(0.0);
    float bob = sin(time * (0.8 + rollB) + rollA * 6.2832);
    vec2 center = vec2(0.5 + (rollB - 0.5) * 0.5 + sin(st.y * 2.6 + rollA * 6.2832) * 0.07, 0.5 + 0.3 * bob * abs(bob));
    vec2 offset = (f - center) * cell;
    float radius = cell.x * (0.09 + rollB * 0.09);
    vec2 squashed = offset * vec2(1.0, 0.72);
    float drop = smoothstep(radius, radius * 0.2, length(squashed));
    float trailWidth = radius * 0.6;
    float above = smoothstep(0.0, 0.03, f.y - center.y) * (1.0 - smoothstep(center.y, 1.0, f.y));
    float beads = mix(0.5, 1.0, smoothstep(0.3, 0.5, fract(st.y * 11.0 + rollA)));
    float trail = smoothstep(trailWidth, trailWidth * 0.3, abs(offset.x)) * above * beads;
    vec2 bend = squashed / radius * drop + vec2(offset.x / trailWidth, 0.0) * trail * 0.45;
    return vec3(bend, max(drop, trail * 0.85));
  }
  vec3 restingDrops(vec2 uv, float time) {
    vec2 st = uv * 22.0;
    vec2 id = floor(st);
    vec2 f = fract(st) - 0.5;
    float rollA = rainHash(id);
    float rollB = rainHash(id + 9.1);
    float life = fract(time * 0.035 + rollB);
    float size = (0.1 + rollA * 0.2) * smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.75, life) * step(0.42, rollB);
    vec2 offset = f - (vec2(rollA, rollB) - 0.5) * 0.55;
    float drop = smoothstep(size, size * 0.35, length(offset));
    return vec3(offset / max(size, 0.01) * drop, drop);
  }
  // 窗外的雨幕：细长的雨丝成列下落，被室内的灯光照出一点亮。
  float rainSheet(vec2 uv, float time, vec2 cell, float speed) {
    float column = floor(uv.x / cell.x);
    float columnRoll = rainHash(vec2(column, 17.0));
    float y = uv.y / cell.y + time * speed * (0.8 + columnRoll * 0.5) + columnRoll * 9.0;
    float present = step(0.62, rainHash(vec2(column, floor(y))));
    float across = abs(fract(uv.x / cell.x) - 0.5);
    float along = fract(y);
    return present * smoothstep(0.07, 0.0, across) * smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.55, along);
  }
  vec3 rainOnGlass(vec2 uv, float time, float amount) {
    vec3 big = slidingDrops(uv, time, vec2(0.4, 2.2), 0.55 * amount);
    vec3 small = slidingDrops(uv + 4.3, time * 1.3, vec2(0.15, 1.0), 0.6 * amount);
    vec3 still = restingDrops(uv, time) * amount;
    return vec3(big.xy + small.xy * 0.7 + still.xy * 0.4, clamp(max(big.z, max(small.z, still.z)), 0.0, 1.0));
  }
`

const glassFragment = /* glsl */ `
  uniform sampler2D uBackdrop;
  uniform samplerCube uOutdoorPanorama;
  uniform samplerCube uInteriorPanorama;
  uniform vec2 uResolution;
  uniform float uPanoramaMode;
  uniform float uHasInterior;
  uniform float uTime;
  uniform float uRain;
  uniform float uMist;
  uniform vec3 uTint;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${rainGlsl}
  void main() {
    vec3 ray = normalize(vWorld - cameraPosition);
    vec3 normal = normalize(vNormalW);
    if (dot(normal, ray) > 0.0) normal = -normal;

    vec2 pane = vec2(atan(-vWorld.z, vWorld.x) * ${room.radius.toFixed(1)}, vWorld.y);
    vec3 rain = rainOnGlass(pane, uTime, uRain);
    float range = length(vWorld - cameraPosition);
    float wet = rain.z;

    vec3 color;
    if (uPanoramaMode > 0.5) {
      // 倒影与环境捕获：镜头不是主镜头，改按视线方向从室外全景里取。
      color = textureLod(uOutdoorPanorama, normalize(ray + vec3(rain.x, rain.y, 0.0) * 0.05), 1.0 + uMist).rgb;
    } else {
      vec2 screen = gl_FragCoord.xy / uResolution;
      float reach = clamp(4.0 / range, 0.25, 1.4) * 0.03;
      vec2 bent = screen - rain.xy * reach * vec2(uResolution.y / uResolution.x, 1.0);
      color = textureLod(uBackdrop, bent, mix(uMist, 0.0, wet)).rgb;
    }
    float sheet = rainSheet(pane, uTime, vec2(0.05, 1.3), 5.5) + rainSheet(pane + 3.7, uTime, vec2(0.028, 0.8), 7.0) * 0.6;
    color += vec3(0.42, 0.55, 0.75) * sheet * 0.045 * uRain * (1.0 - uPanoramaMode);
    // 水汽让玻璃略微发灰；水珠边缘因为折射角大而发暗。
    color *= uTint * mix(0.9, 1.0, wet);
    color *= 1.0 - 0.35 * wet * smoothstep(0.55, 1.0, length(rain.xy));

    // 玻璃映出的室内：越斜着看越明显。
    float facing = clamp(dot(-ray, normal), 0.0, 1.0);
    float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);
    vec3 bounce = reflect(ray, normalize(normal + vec3(rain.x, rain.y, 0.0) * 0.25));
    vec3 reflection = textureLod(uInteriorPanorama, bounce, 1.5).rgb * uHasInterior;
    color += reflection * min(fresnel * 1.6, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`

export interface GlassMaterial {
  material: ShaderMaterial
  setBackdrop: (texture: Texture) => void
  setPanoramaMode: (enabled: boolean) => void
  setPanoramas: (outdoor: CubeTexture, interior: CubeTexture | null) => void
  setResolution: (width: number, height: number) => void
  /** time 为场景运行秒数；减少动态效果时保持为 0，雨水静止。 */
  setTime: (time: number) => void
}

export function createGlassMaterial(): GlassMaterial {
  const uniforms = {
    uBackdrop: { value: null as Texture | null },
    uOutdoorPanorama: { value: null as CubeTexture | null },
    uInteriorPanorama: { value: null as CubeTexture | null },
    uResolution: { value: new Vector2(1, 1) },
    uPanoramaMode: { value: 0 },
    uHasInterior: { value: 0 },
    uTime: { value: 0 },
    uRain: { value: 1 },
    uMist: { value: 1.7 },
    uTint: { value: new Color(0.86, 0.93, 0.97) },
  }
  const material = new ShaderMaterial({ uniforms, vertexShader: glassVertex, fragmentShader: glassFragment })
  return {
    material,
    setBackdrop: (texture) => {
      uniforms.uBackdrop.value = texture
    },
    setPanoramaMode: (enabled) => {
      uniforms.uPanoramaMode.value = enabled ? 1 : 0
    },
    setPanoramas: (outdoor, interior) => {
      uniforms.uOutdoorPanorama.value = outdoor
      uniforms.uInteriorPanorama.value = interior ?? outdoor
      uniforms.uHasInterior.value = interior ? 1 : 0
    },
    setResolution: (width, height) => {
      uniforms.uResolution.value.set(width, height)
    },
    setTime: (time) => {
      uniforms.uTime.value = time
    },
  }
}
