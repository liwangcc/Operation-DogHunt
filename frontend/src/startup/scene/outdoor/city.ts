// 窗外的城市楼群：实例化的楼体，窗灯、楼顶航空灯和雨雾都由着色器按楼体尺寸生成。
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { DEG, room, seededRandom } from '../layout'

interface Block {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  turn: number
  seed: number
}

/**
 * 雨雾的颜色与浓度：远处的楼逐渐融进雾里，产生纵深。贴近地面的雾被街灯染成暖色，高处是冷色。
 * 楼体、街灯和道路共用同一套参数。
 */
export const HAZE = {
  color: new Color(0.03, 0.048, 0.085),
  ground: new Color(0.075, 0.058, 0.05),
  density: 0.0038,
} as const

/** 所有室外着色器共用的雾化函数：按到房间的水平距离衰减，雾色随海拔从暖到冷。 */
export const HAZE_GLSL = /* glsl */ `
  uniform vec3 uHaze;
  uniform vec3 uHazeGround;
  uniform float uHazeDensity;
  vec3 applyHaze(vec3 color, float range, float altitude) {
    vec3 haze = mix(uHazeGround, uHaze, smoothstep(${(room.cityGround).toFixed(1)}, ${(room.cityGround + 70).toFixed(1)}, altitude));
    return mix(haze, color, exp(-range * uHazeDensity));
  }
`

/** 雾化函数需要的三个 uniform；emissive 为 true 时雾只让光变暗而不染色（用于灯点）。 */
export function hazeUniforms(emissive = false) {
  const black = new Color(0, 0, 0)
  return {
    uHaze: { value: emissive ? black : HAZE.color },
    uHazeGround: { value: emissive ? black : HAZE.ground },
    uHazeDensity: { value: HAZE.density },
  }
}

const towerVertex = /* glsl */ `
  attribute float aSeed;
  varying vec2 vFace;
  varying float vSeed;
  varying float vRoof;
  varying float vSide;
  varying float vRange;
  varying float vHeight;
  varying float vAltitude;
  void main() {
    vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    float span = abs(normal.x) > 0.5 ? size.z : size.x;
    vFace = uv * vec2(span, size.y);
    vRoof = step(0.5, abs(normal.y));
    vSide = abs(normal.x) > 0.5 ? 0.62 : 1.0;
    vSeed = aSeed;
    vHeight = size.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vRange = length(world.xz);
    vAltitude = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// 窗格按米数铺开，所以高楼和矮楼的窗户一样大；远到看不清时退化为平均亮度，避免闪烁。
// 种子是整数并在这里取整：插值带来的微小误差一旦进入随机函数，窗户里就会出现雪花噪点。
// 每栋楼随机归入三种风格：整层连排亮灯的办公楼、零星暖色窗户的住宅、几乎全黑的玻璃塔。
const towerFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFacade;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform vec3 uNeon;
  uniform vec3 uSkyTint;
  varying vec2 vFace;
  varying float vSeed;
  varying float vRoof;
  varying float vSide;
  varying float vRange;
  varying float vHeight;
  varying float vAltitude;
  ${HAZE_GLSL}
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  void main() {
    float seed = floor(vSeed + 0.5);
    float style = hash(vec2(seed, 21.0));
    float office = step(style, 0.42);
    float tower = step(0.8, style);
    vec2 cellSize = mix(vec2(2.3, 3.1), vec2(1.5, 3.7), office);
    vec2 cell = vFace / cellSize;
    vec2 id = floor(cell);
    vec2 inner = fract(cell);
    vec2 key = id + vec2(seed, seed * 1.7);

    // 办公楼按“每四跨一组”整段亮灯，住宅逐户随机。
    float occupancy = mix(0.07, 0.46, pow(hash(vec2(seed, 5.0)), 1.6)) * mix(1.0, 0.35, tower);
    float run = hash(vec2(floor(cell.x / 4.0), id.y) + seed * 1.3);
    float room = hash(key);
    float lit = step(1.0 - occupancy, mix(room, run, office * 0.8));

    vec2 paneLow = mix(vec2(0.2, 0.26), vec2(0.07, 0.24), office);
    vec2 paneHigh = mix(vec2(0.8, 0.8), vec2(0.93, 0.84), office);
    float pane = step(paneLow.x, inner.x) * step(inner.x, paneHigh.x) * step(paneLow.y, inner.y) * step(inner.y, paneHigh.y);
    // 一部分窗户拉着半截窗帘；窗内亮度上亮下暗，像吊顶灯照下来。
    float blind = step(hash(key + 3.3), 0.32) * step(0.56, inner.y);
    float inside = (0.3 + 0.7 * hash(key + 2.3)) * (1.0 - 0.7 * blind) * (0.7 + 0.5 * inner.y);
    vec3 lamp = mix(mix(uWarm, uCool, step(0.78, hash(key + 9.2))), mix(uCool, vec3(1.0, 0.94, 0.84), hash(vec2(id.y, seed))), office);

    float detail = clamp(1.0 - max(fwidth(cell.x), fwidth(cell.y)) * 1.4, 0.0, 1.0);
    float flicker = step(0.992, hash(key.yx + 4.7));
    float pulse = mix(1.0, 0.5 + 0.5 * sin(uTime * 1.7 + room * 40.0), flicker);
    float glow = mix(occupancy * 0.22, lit * pane * inside, detail) * pulse;

    vec3 facade = uFacade * (0.55 + 0.9 * hash(vec2(seed, 3.0))) * vSide;
    facade *= 0.86 + 0.14 * step(0.5, fract(cell.x * 0.5));
    // 没亮灯的玻璃映着一点天光；楼体下半截被街道的灯光染暖。
    facade += uSkyTint * 0.05 * pane * (1.0 - lit) * detail;
    facade += uWarm * 0.014 * (1.0 - smoothstep(0.0, 24.0, vFace.y));
    vec3 color = facade + lamp * glow * 2.1;

    // 少数高楼的顶部有一条细细的发光灯带。
    float crown = step(0.86, hash(vec2(seed, 11.0))) * step(34.0, vHeight) * (1.0 - vRoof);
    crown *= smoothstep(vHeight - 2.4, vHeight - 2.2, vFace.y) * smoothstep(vHeight - 0.5, vHeight - 0.7, vFace.y);
    color += mix(uNeon, uWarm, step(0.5, hash(vec2(seed, 13.0)))) * crown * 2.2;
    color = mix(color, uFacade * 0.35, vRoof);
    gl_FragColor = vec4(applyHaze(color, vRange, vAltitude), 1.0);
  }
`

const EYE_HEIGHT = 3.5

/** 距离 range 处的楼要多高，楼顶才会出现在仰角 elevation 上。 */
function heightForElevation(range: number, elevation: number): number {
  return EYE_HEIGHT - room.cityGround + range * Math.tan(elevation)
}

function makeBlock(random: () => number, radius: number, width: number, height: number): Block {
  const angle = random() * Math.PI * 2
  return {
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
    w: width,
    d: width * (0.7 + random() * 0.6),
    h: height,
    turn: random() * Math.PI,
    seed: Math.floor(random() * 256),
  }
}

/** 高楼的退台与天线。 */
function crown(base: Block, random: () => number): Block[] {
  const tier = { ...base, y: base.h, w: base.w * 0.62, d: base.d * 0.62, h: base.h * 0.18, seed: Math.floor(random() * 256) }
  const cap = { ...base, y: base.h * 1.18, w: base.w * 0.3, d: base.d * 0.3, h: base.h * 0.07, seed: 0 }
  const mast = { ...base, y: base.h * 1.25, w: 0.7, d: 0.7, h: base.h * 0.16, seed: 0 }
  return [tier, cap, mast]
}

function planBlocks(random: () => number): { blocks: Block[]; beacons: Vector3[] } {
  const blocks: Block[] = []
  const beacons: Vector3[] = []
  // 脚下的低矮街区：楼顶低于视线，靠近窗边或抬高镜头时可以俯视到。
  for (let i = 0; i < 300; i += 1) blocks.push(makeBlock(random, 55 + 130 * random(), 8 + random() * 14, 6 + random() * 18))
  // 几栋离得近的高楼：转动视角时和远处天际线错开，能看出纵深。
  for (let i = 0; i < 10; i += 1) blocks.push(makeBlock(random, 110 + 60 * random(), 12 + random() * 7, 30 + random() * 16))
  // 天际线：多数楼顶贴着地平线，少数冒高。
  for (let i = 0; i < 420; i += 1) {
    const radius = 170 + 420 * Math.pow(random(), 1.25)
    const elevation = (-1.5 + 5 * Math.pow(random(), 1.8)) * DEG
    blocks.push(makeBlock(random, radius, 10 + random() * 18, heightForElevation(radius, elevation)))
  }
  // 地标：明显高出天际线，顶部有退台、天线和红色航空灯。
  for (let i = 0; i < 20; i += 1) {
    const radius = 240 + 260 * random()
    const tower = makeBlock(random, radius, 14 + random() * 9, heightForElevation(radius, (4.5 + 4.2 * random()) * DEG))
    blocks.push(tower, ...crown(tower, random))
    beacons.push(new Vector3(tower.x, room.cityGround + tower.h * 1.41 + 1, tower.z))
  }
  return { blocks, beacons }
}

function createTowers(blocks: Block[]): { mesh: InstancedMesh; material: ShaderMaterial } {
  const geometry = new BoxGeometry(1, 1, 1)
  geometry.translate(0, 0.5, 0)
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(blocks.map((block) => block.seed)), 1))
  const material = new ShaderMaterial({
    vertexShader: towerVertex,
    fragmentShader: towerFragment,
    uniforms: {
      uTime: { value: 0 },
      uFacade: { value: new Color(0.012, 0.017, 0.028) },
      uCool: { value: new Color(0.55, 0.82, 1.0) },
      uWarm: { value: new Color(1.0, 0.72, 0.42) },
      uNeon: { value: new Color(0.25, 0.9, 1.0) },
      uSkyTint: { value: new Color(0.3, 0.42, 0.7) },
      ...hazeUniforms(),
    },
  })
  const mesh = new InstancedMesh(geometry, material, blocks.length)
  const matrix = new Matrix4()
  const turn = new Quaternion()
  const up = new Vector3(0, 1, 0)
  blocks.forEach((block, index) => {
    turn.setFromAxisAngle(up, block.turn)
    matrix.compose(new Vector3(block.x, room.cityGround + block.y, block.z), turn, new Vector3(block.w, block.h, block.d))
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  return { mesh, material }
}

const lightVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  varying vec3 vColor;
  varying float vRange;
  void main() {
    // aPhase 小于 0 表示常亮；否则按各自的节奏闪烁（航空障碍灯）。
    float blink = aPhase < 0.0 ? 1.0 : smoothstep(0.75, 0.9, fract(uTime * 0.6 + aPhase));
    vColor = aColor * blink;
    vRange = length(position.xz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`

const lightFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vRange;
  ${HAZE_GLSL}
  void main() {
    float falloff = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(applyHaze(vColor, vRange, 0.0), falloff);
  }
`

/** 一组发光的点：街灯常亮，航空灯闪烁。 */
function createLights(points: Array<{ position: Vector3; color: Color; phase: number }>, size: number): { points: Points; material: ShaderMaterial } {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => p.position.toArray()), 3))
  geometry.setAttribute('aColor', new Float32BufferAttribute(points.flatMap((p) => p.color.toArray()), 3))
  geometry.setAttribute('aPhase', new Float32BufferAttribute(points.map((p) => p.phase), 1))
  const material = new ShaderMaterial({
    vertexShader: lightVertex,
    fragmentShader: lightFragment,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, ...hazeUniforms(true) },
  })
  const mesh = new Points(geometry, material)
  mesh.frustumCulled = false
  return { points: mesh, material }
}

function streetLights(random: () => number): Array<{ position: Vector3; color: Color; phase: number }> {
  const warm = new Color(1.0, 0.62, 0.3)
  const cool = new Color(0.6, 0.85, 1.0)
  return Array.from({ length: 1400 }, () => {
    const radius = 45 + 560 * Math.pow(random(), 1.2)
    const angle = random() * Math.PI * 2
    const color = (random() > 0.35 ? warm : cool).clone().multiplyScalar(0.6 + random() * 2.2)
    return { position: new Vector3(Math.cos(angle) * radius, room.cityGround + 0.8, Math.sin(angle) * radius), color, phase: -1 }
  })
}

export interface City {
  object: Group
  update: (time: number) => void
  /** 绘图缓冲区变化时，按像素密度调整灯点大小。 */
  setPixelRatio: (ratio: number) => void
}

export function createCity(): City {
  const random = seededRandom(7421)
  const plan = planBlocks(random)
  const ground = new Mesh(new CircleGeometry(1000, 64), new MeshBasicMaterial({ color: new Color(0.004, 0.007, 0.012) }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = room.cityGround
  const towers = createTowers(plan.blocks)
  const streets = createLights(streetLights(random), 3)
  const red = new Color(4.5, 0.25, 0.12)
  const beacons = createLights(plan.beacons.map((position) => ({ position, color: red, phase: random() })), 5)
  const object = new Group()
  object.add(ground, towers.mesh, streets.points, beacons.points)
  return {
    object,
    update: (time) => {
      towers.material.uniforms.uTime.value = time
      beacons.material.uniforms.uTime.value = time
    },
    setPixelRatio: (ratio) => {
      streets.material.uniforms.uSize.value = 3 * ratio
      beacons.material.uniforms.uSize.value = 5 * ratio
    },
  }
}
