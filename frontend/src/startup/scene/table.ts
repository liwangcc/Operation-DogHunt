// 中央战术桌的实体：八边形桌身、灯带、检修格栅、玻璃显示台面、四角的全息投射器和台面上的小物件。
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { createCourtTexture } from '../textures/court'
import { Assembly } from './assembly'
import { loftOutline, rbox, type Outline } from './build'
import { palette } from './layout'

/** 桌面轮廓：半长、半宽、切角与台面高度。镜头最近距离要大于半长。 */
export const tableTop = { halfLength: 2.95, halfWidth: 1.95, chamfer: 0.8, height: 0.905 } as const
/** 玻璃显示面相对桌沿的内收量，以及它略低于桌沿的高度。 */
export const tableGlass = { inset: 0.2, height: 0.895 } as const

/** 向内收 inset 米后的桌面轮廓。 */
export function tableOutline(inset: number): Outline {
  const a = tableTop.halfLength - inset
  const b = tableTop.halfWidth - inset
  // 45° 切角平行内收时，切角长度按 2 - √2 的比例缩短。
  const c = tableTop.chamfer - inset * 0.586
  return [[a - c, b], [a, b - c], [a, -(b - c)], [a - c, -b], [-(a - c), -b], [-a, -(b - c)], [-a, b - c], [-(a - c), b]]
}

/** 桌身自下而上：缩进的底座、藏在底座上沿的青色灯带、向上外扩的桌身、腰线暗槽、桌沿。 */
function addBody(parts: Assembly<MaterialName>): void {
  parts.add('blackMetal', loftOutline(tableOutline, [[0.62, 0], [0.62, 0.09]], false))
  parts.add('ledTeal', loftOutline(tableOutline, [[0.6, 0.094], [0.6, 0.126]], false))
  parts.add('gunmetal', loftOutline(tableOutline, [[0.52, 0.13], [0.5, 0.15], [0.2, 0.6], [0.2, 0.64]], false, true))
  parts.add('void', loftOutline(tableOutline, [[0.27, 0.64], [0.27, 0.7]], false))
  parts.add('ledTeal', loftOutline(tableOutline, [[0.264, 0.662], [0.264, 0.676]], false))
  parts.add(
    'gunmetal',
    loftOutline(tableOutline, [[0.28, 0.7], [0.02, 0.7], [0, 0.72], [0, 0.885], [0.02, 0.905], [tableGlass.inset, 0.905], [tableGlass.inset, tableGlass.height]], false),
  )
  parts.add('steel', loftOutline(tableOutline, [[0.085, 0.9056], [0.115, 0.9056]], false))
}

/** 桌身长边是斜面：在斜面上各装三块带百叶和指示灯的检修板。 */
function addServicePanels(parts: Assembly<MaterialName>): void {
  const slope = Math.atan(0.3 / 0.45)
  for (const side of [0, Math.PI]) {
    const face = new Matrix4().makeRotationY(side).multiply(new Matrix4().makeTranslation(0, 0.375, 1.6)).multiply(new Matrix4().makeRotationX(slope))
    for (const x of [-1.25, 0, 1.25]) {
      const at = (dx: number, dy: number, dz: number) => face.clone().multiply(new Matrix4().makeTranslation(x + dx, dy, dz))
      parts.add('blackMetal', rbox(1.05, 0.36, 0.014, 0.006), at(0, 0, 0.007))
      for (let slat = 0; slat < 9; slat += 1) parts.add('void', rbox(0.84, 0.014, 0.004, 0.001), at(-0.06, -0.128 + slat * 0.032, 0.015))
      parts.add('ledGreen', rbox(0.014, 0.014, 0.004, 0.001), at(0.46, 0.13, 0.015))
      parts.add('ledAmberDim', rbox(0.014, 0.014, 0.004, 0.001), at(0.46, 0.1, 0.015))
    }
  }
}

/** 四角的全息投射器：底座、朝桌心倾斜的镜筒和发光镜片。 */
function addProjectors(parts: Assembly<MaterialName>): Vector3[] {
  const [corner, next] = tableOutline(0.1)
  const x = (corner[0] + next[0]) / 2
  const z = (corner[1] + next[1]) / 2
  const up = new Vector3(0, 1, 0)
  const lenses: Vector3[] = []
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const base = new Vector3(x * sx, tableTop.height, z * sz)
    const inward = new Vector3(-base.x, 0, -base.z).normalize()
    const axis = inward.multiplyScalar(Math.sin(0.6)).add(up.clone().multiplyScalar(Math.cos(0.6))).normalize()
    const tilt = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(up, axis))
    const mount = new Matrix4().makeTranslation(base.x, base.y + 0.03, base.z).multiply(tilt)
    parts.add('gunmetal', new CylinderGeometry(0.075, 0.085, 0.03, 24), new Matrix4().makeTranslation(base.x, base.y + 0.015, base.z))
    parts.add('blackMetal', new CylinderGeometry(0.05, 0.058, 0.09, 24), mount.clone().multiply(new Matrix4().makeTranslation(0, 0.045, 0)))
    parts.add('ledTeal', new CylinderGeometry(0.036, 0.036, 0.006, 24), mount.clone().multiply(new Matrix4().makeTranslation(0, 0.092, 0)))
    lenses.push(new Vector3(0, 0.092, 0).applyMatrix4(mount))
  }
  return lenses
}

/** 长边桌沿上的两组按键、一条状态灯，以及随手放着的两块平板。 */
function addRimControls(parts: Assembly<MaterialName>): void {
  const y = tableTop.height
  for (const side of [1, -1]) {
    const z = side * (tableTop.halfWidth - 0.1)
    for (const start of [-1.9, 1.2]) {
      for (let key = 0; key < 8; key += 1) parts.add('plastic', rbox(0.06, 0.012, 0.045, 0.004), new Matrix4().makeTranslation(start + key * 0.1, y + 0.006, z))
    }
    parts.add('ledTealDim', rbox(1.7, 0.004, 0.012, 0.001), new Matrix4().makeTranslation(0, y + 0.002, z))
  }
  const tablets: Array<[number, number, number]> = [[-1.35, 1.52, 0.3], [1.7, -1.5, -0.22]]
  for (const [x, z, turn] of tablets) {
    const place = new Matrix4().makeTranslation(x, tableGlass.height + 0.006, z).multiply(new Matrix4().makeRotationY(turn))
    parts.add('blackMetal', rbox(0.27, 0.009, 0.19, 0.004), place)
    parts.add('ledTealDim', rbox(0.245, 0.002, 0.165, 0.0008), place.clone().multiply(new Matrix4().makeTranslation(0, 0.0052, 0)))
  }
}

/** 玻璃显示面：贴图坐标按外接矩形铺满，球场贴图因此与真实尺寸成比例。 */
function createGlassTop(): BufferGeometry {
  const outline = tableOutline(tableGlass.inset)
  const halfX = tableTop.halfLength - tableGlass.inset
  const halfZ = tableTop.halfWidth - tableGlass.inset
  const positions: number[] = []
  const uvs: number[] = []
  const push = (x: number, z: number): void => {
    positions.push(x, tableGlass.height, z)
    uvs.push((x + halfX) / (halfX * 2), 1 - (z + halfZ) / (halfZ * 2))
  }
  outline.forEach(([x, z], i) => {
    const [nextX, nextZ] = outline[(i + 1) % outline.length]
    push(0, 0)
    push(x, z)
    push(nextX, nextZ)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

export interface Table {
  object: Group
  /** 四个投射器镜片的位置，全息光束从这里发出。 */
  lenses: Vector3[]
  /** 玻璃显示面的宽度（米），球场贴图铺满这个宽度。 */
  surfaceWidth: number
  /** 台面球场的亮度随时间轻微起伏。 */
  update: (time: number) => void
  dispose: () => void
}

export function createTable(kit: MaterialKit): Table {
  const parts = new Assembly<MaterialName>()
  addBody(parts)
  addServicePanels(parts)
  addRimControls(parts)
  const lenses = addProjectors(parts)

  const court = createCourtTexture()
  const screen = new MeshPhysicalMaterial({
    color: 0x020406,
    roughness: 0.09,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    emissive: palette.glow,
    emissiveMap: court,
    emissiveIntensity: 2.2,
  })
  const glass = new Mesh(createGlassTop(), screen)
  glass.receiveShadow = true

  const object = new Group()
  object.add(parts.build(kit.materials), glass)
  return {
    object,
    lenses,
    surfaceWidth: (tableTop.halfLength - tableGlass.inset) * 2,
    update: (time) => {
      screen.emissiveIntensity = 2.1 + 0.25 * Math.sin(time * 0.8)
    },
    dispose: () => {
      court.dispose()
      screen.dispose()
    },
  }
}
