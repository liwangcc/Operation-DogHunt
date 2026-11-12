// 城市道路与车流：贴着地面的路面条带，车灯由着色器沿道路方向流动，一侧白色前灯、一侧红色尾灯。
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three'
import { room } from '../layout'
import { HAZE_GLSL, hazeUniforms } from './city'

const ROAD_WIDTH = 13
const UP = new Vector3(0, 1, 0)

/** 沿曲线铺一条等宽的路面；贴图坐标 x 是沿路的米数，y 是横向 0–1。 */
function ribbon(curve: CatmullRomCurve3, samples: number): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let travelled = 0
  let previous = curve.getPoint(0)
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const point = curve.getPoint(t)
    const side = new Vector3().crossVectors(UP, curve.getTangent(t)).normalize().multiplyScalar(ROAD_WIDTH / 2)
    travelled += point.distanceTo(previous)
    previous = point
    positions.push(point.x + side.x, point.y, point.z + side.z, point.x - side.x, point.y, point.z - side.z)
    uvs.push(travelled, 0, travelled, 1)
    if (i < samples) {
      const k = i * 2
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

const height = room.cityGround + 0.4

/** 环绕城市的弧形道路：半径随路程轻微摆动。 */
function ringRoad(start: number, sweep: number, radius: number, sway: number): CatmullRomCurve3 {
  const points: Vector3[] = []
  for (let i = 0; i <= 28; i += 1) {
    const t = i / 28
    const angle = start + sweep * t
    const range = radius + sway * Math.sin(t * Math.PI * 3)
    points.push(new Vector3(Math.cos(angle) * range, height, Math.sin(angle) * range))
  }
  return new CatmullRomCurve3(points)
}

/** 从近处伸向地平线的放射道路。 */
function radialRoad(angle: number, bend: number): CatmullRomCurve3 {
  const points: Vector3[] = []
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14
    const range = 70 + 560 * t
    const heading = angle + bend * Math.sin(t * Math.PI)
    points.push(new Vector3(Math.cos(heading) * range, height, Math.sin(heading) * range))
  }
  return new CatmullRomCurve3(points)
}

const roadVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vRange;
  void main() {
    vUv = uv;
    vRange = length(position.xz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 四条车道：前两条朝一个方向（白色前灯），后两条反向（红色尾灯）。每条车道按固定间距划分“车位”，
// 约六成车位上有车，整体沿道路匀速滑动；车灯在湿路面上拖出一小段反光。
const roadFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAsphalt;
  uniform vec3 uHead;
  uniform vec3 uTail;
  varying vec2 vUv;
  varying float vRange;
  ${HAZE_GLSL}
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  void main() {
    float lane = floor(vUv.y * 4.0);
    float across = fract(vUv.y * 4.0) - 0.5;
    float direction = lane < 2.0 ? 1.0 : -1.0;
    float speed = 12.0 + 8.0 * hash(vec2(lane, 1.0));
    float slot = (vUv.x + direction * uTime * speed) / 28.0 + lane * 0.37;
    float along = fract(slot) - 0.5;
    float present = step(0.4, hash(vec2(floor(slot), lane)));
    float lamp = smoothstep(0.1, 0.0, abs(along)) * smoothstep(0.42, 0.08, abs(across));
    float smear = smoothstep(0.46, 0.0, abs(along)) * smoothstep(0.5, 0.2, abs(across)) * 0.12;
    vec3 color = uAsphalt + (direction > 0.0 ? uHead : uTail) * present * (lamp * 3.4 + smear);
    // 路灯在路面上每隔一段留下一圈暖光。
    color += vec3(1.0, 0.6, 0.3) * 0.02 * smoothstep(0.5, 0.0, abs(fract(vUv.x / 44.0) - 0.5) * 2.4);
    gl_FragColor = vec4(applyHaze(color, vRange, ${height.toFixed(1)}), 1.0);
  }
`

export interface Traffic {
  object: Group
  update: (time: number) => void
}

export function createTraffic(): Traffic {
  const material = new ShaderMaterial({
    vertexShader: roadVertex,
    fragmentShader: roadFragment,
    uniforms: {
      uTime: { value: 0 },
      uAsphalt: { value: new Color(0.006, 0.008, 0.012) },
      uHead: { value: new Color(1.0, 0.94, 0.8) },
      uTail: { value: new Color(1.0, 0.1, 0.06) },
      ...hazeUniforms(),
    },
  })
  const curves = [
    ringRoad(0.2, 2.6, 150, 18),
    ringRoad(2.9, 2.4, 215, 26),
    ringRoad(4.6, 2.9, 300, 24),
    ringRoad(1.4, 2.2, 400, 32),
    ringRoad(3.6, 2.6, 520, 30),
    ...[0.5, 1.4, 1.75, 2.6, 3.9, 4.5, 5.2].map((angle, index) => radialRoad(angle, index % 2 ? 0.16 : -0.12)),
  ]
  const object = new Group()
  for (const curve of curves) {
    const road = new Mesh(ribbon(curve, 160), material)
    road.frustumCulled = false
    object.add(road)
  }
  return {
    object,
    update: (time) => {
      material.uniforms.uTime.value = time
    },
  }
}
