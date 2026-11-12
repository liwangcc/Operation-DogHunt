// 投影光束与浮尘：吊顶投影机照向战术桌的光柱、桌角投射器的细光束，以及光柱里缓慢飘动的尘埃。
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette, seededRandom } from '../layout'

const beamVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vAlong;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vAlong = uv.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// 光柱只画圆锥的外壳，但按“表面有多正对镜头”来决定亮度：正对的地方光程长、更亮，轮廓处淡到看不见，
// 这样就不会露出硬边，看起来像一团有体积的光。
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vAlong;
  float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }
  void main() {
    vec3 toEye = normalize(cameraPosition - vWorld);
    float facing = pow(abs(dot(normalize(vNormalW), toEye)), 1.6);
    float angle = atan(vWorld.z, vWorld.x);
    float streak = 0.75 + 0.25 * sin(angle * 22.0 + uTime * 0.35) * sin(angle * 9.0 - uTime * 0.2);
    // 插值后的值可能是极小的负数，直接开方会得到非数并被泛光扩散成一大片白。
    float span = clamp(vAlong, 0.0, 1.0);
    float along = pow(span, 1.4) * smoothstep(0.0, 0.08, span) * smoothstep(1.0, 0.92, span);
    gl_FragColor = vec4(uColor * facing * streak * (0.25 + along) * uOpacity, 1.0);
  }
`

function createBeamMaterial(opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    uniforms: { uColor: { value: new Color(palette.glow) }, uTime: { value: 0 }, uOpacity: { value: opacity } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

const dustVertex = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  varying float vGlint;
  void main() {
    vec3 drift = position;
    // 尘埃缓慢上升并左右飘，升到顶后从底部重新出现。
    drift.y = 1.0 + mod(position.y - 1.0 + uTime * (0.02 + aPhase * 0.03), 5.6);
    drift.x += sin(uTime * 0.21 + aPhase * 40.0) * 0.12;
    drift.z += cos(uTime * 0.17 + aPhase * 31.0) * 0.12;
    vec4 view = modelViewMatrix * vec4(drift, 1.0);
    vGlint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.7 + aPhase) + aPhase * 90.0), 4.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * (0.6 + aPhase) / max(-view.z, 0.5);
  }
`

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vGlint;
  void main() {
    float falloff = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor * falloff * vGlint * uOpacity, 1.0);
  }
`

function createDust(): { points: Points; material: ShaderMaterial } {
  const random = seededRandom(411)
  const positions: number[] = []
  const phases: number[] = []
  for (let i = 0; i < 260; i += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * 2.4
    positions.push(Math.cos(angle) * radius, 1 + random() * 5.6, Math.sin(angle) * radius)
    phases.push(random())
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
  const material = new ShaderMaterial({
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    uniforms: { uColor: { value: new Color(palette.glow) }, uTime: { value: 0 }, uSize: { value: 13 }, uOpacity: { value: 0.3 } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return { points, material }
}

export interface Beams {
  object: Group
  update: (time: number, master: number) => void
  /** 浮尘点的大小随像素密度缩放。 */
  setPixelRatio: (ratio: number) => void
}

/**
 * @param lensHeight 吊顶投影机镜片的高度
 * @param tableHeight 桌面高度，光柱照到这里为止
 * @param corners 桌角四个投射器镜片的位置
 */
export function createBeams(lensHeight: number, tableHeight: number, corners: Vector3[]): Beams {
  const object = new Group()
  const main = createBeamMaterial(0.07)
  const height = lensHeight - tableHeight
  const shaft = new Mesh(new CylinderGeometry(0.17, 2.7, height, 64, 1, true), main)
  shaft.position.y = tableHeight + height / 2
  object.add(shaft)

  const side = createBeamMaterial(0.22)
  const up = new Vector3(0, 1, 0)
  for (const lens of corners) {
    // 桌角的投射器朝球场上方中心投出一束细光。
    const aim = new Vector3(0, tableHeight + 1.3, 0).sub(lens)
    const reach = aim.length() * 0.9
    // 圆锥细的一端（顶端）对着镜片，所以把圆柱的竖轴对准“射向镜片”的方向。
    const beam = new Mesh(new CylinderGeometry(0.03, 0.34, reach, 24, 1, true), side)
    beam.quaternion.copy(new Quaternion().setFromUnitVectors(up, aim.clone().normalize().negate()))
    beam.position.copy(lens).addScaledVector(aim.normalize(), reach / 2)
    object.add(beam)
  }
  const dust = createDust()
  object.add(dust.points)
  return {
    object,
    update: (time, master) => {
      main.uniforms.uTime.value = time
      main.uniforms.uOpacity.value = 0.07 * master
      side.uniforms.uTime.value = time
      side.uniforms.uOpacity.value = 0.22 * master
      dust.material.uniforms.uTime.value = time
    },
    setPixelRatio: (ratio) => {
      dust.material.uniforms.uSize.value = 13 * ratio
    },
  }
}
