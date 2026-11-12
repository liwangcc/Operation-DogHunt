// 雨夜的天空：被城市灯光从下方照亮的低云、偶尔的闪电，以及地平线上的远山剪影。
import {
  BackSide,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { room, seededRandom } from '../layout'

const domeVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 云层画在一个“无限大的天花板”上：视线越接近地平线，看到的云越远、越密。
const domeFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uCityGlow;
  uniform vec3 uFlashDirection;
  uniform float uFlash;
  uniform float uTime;
  varying vec3 vDirection;
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float clouds(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * noise(p);
      p = p * 2.03 + 11.7;
      amp *= 0.5;
    }
    return sum;
  }
  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y, 0.0, 1.0);
    vec2 ceiling = direction.xz / (direction.y + 0.16) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
    float density = smoothstep(0.32, 0.78, clouds(ceiling) + clouds(ceiling * 2.7 + 3.1) * 0.35);
    vec3 sky = mix(uHorizon, uZenith, pow(height, 0.5));
    // 云底被城市灯光染亮，越靠近地平线越亮。
    vec3 lit = uCityGlow * (0.25 + 1.6 * pow(1.0 - height, 4.0));
    vec3 color = mix(sky, lit, density * 0.85);
    float near = pow(max(dot(direction, normalize(uFlashDirection)), 0.0), 6.0);
    color += vec3(0.62, 0.74, 1.0) * uFlash * (0.1 + near * 1.7) * (0.35 + density);
    gl_FragColor = vec4(color, 1.0);
  }
`

/** 一圈高低起伏的山脊；首尾用同一高度闭合，避免出现接缝。 */
function createMountains(random: () => number): Mesh {
  const segments = 120
  const radius = 900
  const base = room.cityGround - 5
  const positions: number[] = []
  const indices: number[] = []
  const jitter = Array.from({ length: segments }, () => random() * 12)
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const ridge = 74 + 18 * Math.sin(angle * 3 + 1.3) + 13 * Math.sin(angle * 7 + 0.4) + 7 * Math.sin(angle * 13 + 2.1)
    const height = Math.max(52, ridge + jitter[i % segments])
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    positions.push(x, base, z, x, base + height, z)
  }
  for (let i = 0; i < segments; i += 1) {
    const k = i * 2
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return new Mesh(geometry, new MeshBasicMaterial({ color: new Color(0.012, 0.02, 0.034), side: DoubleSide }))
}

export interface Sky {
  object: Group
  update: (time: number) => void
  /** 闪电：amount 为 0–1 的瞬时亮度，azimuth 是闪电所在的方位角。 */
  flash: (amount: number, azimuth: number) => void
}

export function createSky(): Sky {
  const uniforms = {
    uZenith: { value: new Color(0.006, 0.01, 0.02) },
    uHorizon: { value: new Color(0.03, 0.055, 0.1) },
    uCityGlow: { value: new Color(0.1, 0.12, 0.2) },
    uFlashDirection: { value: new Vector3(0, 0.3, -1) },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  }
  const dome = new Mesh(
    new SphereGeometry(1800, 48, 24),
    new ShaderMaterial({ uniforms, vertexShader: domeVertex, fragmentShader: domeFragment, side: BackSide, depthWrite: false }),
  )
  const object = new Group()
  object.add(dome, createMountains(seededRandom(20261112)))
  return {
    object,
    update: (time) => {
      uniforms.uTime.value = time
    },
    flash: (amount, azimuth) => {
      uniforms.uFlash.value = amount
      uniforms.uFlashDirection.value.set(Math.cos(azimuth), 0.35, -Math.sin(azimuth))
    },
  }
}
