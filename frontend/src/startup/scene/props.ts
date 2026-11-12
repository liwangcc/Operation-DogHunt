// 可重复摆放的小件：办公椅、盆栽和篮球。每个函数把零件登记到装配器里，由调用方决定摆在哪。
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, SphereGeometry, TorusGeometry } from 'three'
import type { MaterialName } from '../materials/kit'
import type { Assembly } from './assembly'
import { rbox } from './build'

type Parts = Assembly<MaterialName>

function at(place: Matrix4, x: number, y: number, z: number, turnY = 0, tiltZ = 0): Matrix4 {
  const local = new Matrix4().makeTranslation(x, y, z)
  if (turnY !== 0) local.multiply(new Matrix4().makeRotationY(turnY))
  if (tiltZ !== 0) local.multiply(new Matrix4().makeRotationZ(tiltZ))
  return place.clone().multiply(local)
}

/** 办公椅：五星脚、气压杆、皮面坐垫和略微后仰的靠背。椅子自身的 +x 是面朝的方向。 */
export function addChair(parts: Parts, place: Matrix4): void {
  for (let i = 0; i < 5; i += 1) {
    const turn = (i / 5) * Math.PI * 2
    parts.add('steel', rbox(0.3, 0.028, 0.05, 0.01), at(place, Math.cos(turn) * 0.15, 0.075, -Math.sin(turn) * 0.15, turn))
    parts.add('plastic', new CylinderGeometry(0.028, 0.028, 0.04, 12).rotateX(Math.PI / 2), at(place, Math.cos(turn) * 0.29, 0.03, -Math.sin(turn) * 0.29, turn))
  }
  parts.add('chrome', new CylinderGeometry(0.026, 0.026, 0.3, 12), at(place, 0, 0.24, 0))
  parts.add('blackMetal', new CylinderGeometry(0.11, 0.07, 0.05, 20), at(place, 0, 0.405, 0))
  parts.add('blackLeather', rbox(0.5, 0.085, 0.5, 0.036, 4), at(place, 0.01, 0.47, 0))
  parts.add('gunmetal', rbox(0.045, 0.36, 0.09, 0.012), at(place, -0.27, 0.62, 0, 0, 0.16))
  parts.add('blackLeather', rbox(0.07, 0.62, 0.46, 0.032, 4), at(place, -0.29, 0.9, 0, 0, 0.14))
  for (const side of [1, -1]) {
    parts.add('gunmetal', rbox(0.03, 0.2, 0.03, 0.008), at(place, 0.02, 0.6, side * 0.27))
    parts.add('plastic', rbox(0.26, 0.03, 0.07, 0.014), at(place, 0.04, 0.705, side * 0.27))
  }
}

/** 一片弯垂的长叶：从根部向上再向外弯下，中间宽、两头尖，沿中线略微对折。 */
function leafBlade(length: number, width: number, lean: number, droop: number): BufferGeometry {
  const segments = 9
  const positions: number[] = []
  let x = 0
  let y = 0
  const rows: Array<[number, number, number]> = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    rows.push([x, y, width * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.8) * 0.5])
    const angle = lean + droop * t * t
    x += Math.sin(angle) * (length / segments)
    y += Math.cos(angle) * (length / segments)
  }
  for (let i = 0; i < segments; i += 1) {
    const [x0, y0, w0] = rows[i]
    const [x1, y1, w1] = rows[i + 1]
    // 每段由中线两侧的两块面组成，边缘比中线略高，形成对折。
    for (const side of [1, -1]) {
      const fold = 0.25
      positions.push(x0, y0, 0, x1, y1, 0, x1 - w1 * fold * 0.3, y1 + w1 * fold, side * w1)
      positions.push(x0, y0, 0, x1 - w1 * fold * 0.3, y1 + w1 * fold, side * w1, x0 - w0 * fold * 0.3, y0 + w0 * fold, side * w0)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** 落地盆栽：深色高筒花盆、一层土，十几片朝四周散开的长叶。 */
export function addPlant(parts: Parts, place: Matrix4, random: () => number, scale = 1): void {
  const potHeight = 0.72 * scale
  parts.add('gunmetal', new CylinderGeometry(0.3 * scale, 0.22 * scale, potHeight, 32), at(place, 0, potHeight / 2, 0))
  parts.add('steel', new TorusGeometry(0.3 * scale, 0.012, 8, 40).rotateX(Math.PI / 2), at(place, 0, potHeight, 0))
  parts.add('soil', new CylinderGeometry(0.28 * scale, 0.28 * scale, 0.02, 24), at(place, 0, potHeight - 0.03, 0))
  const leaves = 15
  for (let i = 0; i < leaves; i += 1) {
    const turn = (i / leaves) * Math.PI * 2 + random() * 0.6
    const lean = 0.1 + random() * 0.55
    const blade = leafBlade((0.75 + random() * 0.5) * scale, (0.13 + random() * 0.06) * scale, lean, 0.9 + random() * 0.9)
    parts.add('leaf', blade, at(place, 0, potHeight - 0.04, 0, turn))
  }
}

/** 篮球：橙色颗粒皮面加四道黑色球缝。 */
export function addBasketball(parts: Parts, place: Matrix4, radius = 0.12): void {
  parts.add('ball', new SphereGeometry(radius, 40, 28), place)
  const seam = (ring: number, offset: number, turnX: number, turnZ: number): void => {
    const geometry = new TorusGeometry(ring, radius * 0.022, 6, 48).translate(0, 0, offset)
    const local = new Matrix4().makeRotationX(turnX).multiply(new Matrix4().makeRotationZ(turnZ))
    parts.add('plastic', geometry, place.clone().multiply(local))
  }
  seam(radius * 1.002, 0, 0, 0)
  seam(radius * 1.002, 0, Math.PI / 2, 0)
  // 两侧的弧形球缝近似为偏离球心的小圆。
  const offset = radius * 0.62
  const small = Math.sqrt(radius * radius - offset * offset) * 1.002
  seam(small, offset, 0, 0)
  seam(small, -offset, 0, 0)
}
