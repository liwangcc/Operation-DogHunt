// 左侧的弧形工作台：石材台面、三个工位（每个工位三块显示器、键盘、座椅），对应比赛、记录和统计三个模块。
import { CylinderGeometry, Group, Matrix4, Mesh, PlaneGeometry, PointLight } from 'three'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { createScreenMaterial, type ScreenKind, type ScreenMaterial } from '../materials/screen'
import { Assembly } from './assembly'
import { rbox, ringBlock } from './build'
import { DEG, palette, polar, radialMatrix, seededRandom } from './layout'
import { addChair } from './props'
import { consoleAngles } from './stations'

const ARC = { from: 149 * DEG, to: 211 * DEG }
/** 台面内沿、外沿的半径与台面高度。工位的本地原点在内沿上，+x 指向窗外。 */
const DESK = { inner: 8.3, outer: 9.3, height: 0.77 }
const RISER = 0.03

type Parts = Assembly<MaterialName>

function addDesk(parts: Parts): void {
  parts.add('darkStone', ringBlock(DESK.inner, DESK.outer, DESK.height - 0.04, DESK.height, 0.008, ARC))
  parts.add('steel', ringBlock(DESK.inner - 0.006, DESK.inner + 0.002, DESK.height - 0.036, DESK.height - 0.006, 0.002, ARC))
  parts.add('ledTealDim', ringBlock(DESK.inner + 0.03, DESK.inner + 0.045, DESK.height - 0.052, DESK.height - 0.04, 0.002, ARC))
  parts.add('blackMetal', ringBlock(DESK.outer - 0.08, DESK.outer - 0.04, 0.08, DESK.height - 0.04, 0.006, ARC))
  parts.add('blackMetal', ringBlock(DESK.outer - 0.36, DESK.outer - 0.02, DESK.height, DESK.height + RISER, 0.006, ARC))
  // 四个柜体把台面托起来，中间留出腿部空间。
  for (const center of [150.5, 170, 190, 209.5]) {
    const span = { from: (center - 1.6) * DEG, to: (center + 1.6) * DEG }
    parts.add('gunmetal', ringBlock(DESK.inner + 0.14, DESK.outer - 0.1, 0.06, DESK.height - 0.04, 0.012, span))
    parts.add('void', ringBlock(DESK.inner + 0.18, DESK.outer - 0.14, 0, 0.06, 0.002, span))
    parts.add('steel', ringBlock(DESK.inner + 0.132, DESK.inner + 0.14, 0.4, 0.44, 0.002, { from: span.from + 0.4 * DEG, to: span.to - 0.4 * DEG }))
  }
}

/** 一块显示器：外壳、支架和发光屏幕。place 是屏幕中心的位置，屏幕朝向本地的 -x（房间中心）。 */
function addMonitor(parts: Parts, screens: Group, material: ScreenMaterial, place: Matrix4, width: number, height: number): void {
  parts.add('plastic', rbox(0.028, height + 0.026, width + 0.026, 0.008), place)
  parts.add('blackMetal', rbox(0.04, height * 0.5, 0.07, 0.008), place.clone().multiply(new Matrix4().makeTranslation(0.03, -height * 0.32, 0)))
  const screen = new Mesh(new PlaneGeometry(width, height), material.material)
  screen.applyMatrix4(place.clone().multiply(new Matrix4().makeTranslation(-0.0152, 0, 0)).multiply(new Matrix4().makeRotationY(-Math.PI / 2)))
  screens.add(screen)
}

interface Workstation {
  angle: number
  center: ScreenKind
  sides: [ScreenKind, ScreenKind]
}

function addWorkstation(parts: Parts, screens: Group, materials: Map<string, ScreenMaterial>, station: Workstation, random: () => number): void {
  const origin = radialMatrix(station.angle, DESK.inner, 0)
  const local = (x: number, y: number, z: number, turn = 0) => {
    const matrix = origin.clone().multiply(new Matrix4().makeTranslation(x, y, z))
    return turn === 0 ? matrix : matrix.multiply(new Matrix4().makeRotationY(turn))
  }
  const screenFor = (kind: ScreenKind, aspect: number): ScreenMaterial => {
    const key = `${kind}:${aspect.toFixed(2)}`
    const existing = materials.get(key)
    if (existing) return existing
    const created = createScreenMaterial(kind, aspect)
    materials.set(key, created)
    return created
  }
  const top = DESK.height + RISER
  addMonitor(parts, screens, screenFor(station.center, 0.88 / 0.38), local(0.8, top + 0.3, 0), 0.88, 0.38)
  addMonitor(parts, screens, screenFor(station.sides[0], 0.6 / 0.36), local(0.71, top + 0.29, 0.77, -0.46), 0.6, 0.36)
  addMonitor(parts, screens, screenFor(station.sides[1], 0.6 / 0.36), local(0.71, top + 0.29, -0.77, 0.46), 0.6, 0.36)
  parts.add('blackMetal', rbox(0.22, 0.012, 0.3, 0.005), local(0.82, top + 0.006, 0))

  parts.add('fabric', rbox(0.38, 0.004, 0.86, 0.002), local(0.32, DESK.height + 0.002, 0))
  parts.add('plastic', rbox(0.14, 0.018, 0.44, 0.006), local(0.3, DESK.height + 0.013, -0.05))
  parts.add('plastic', rbox(0.1, 0.028, 0.06, 0.012), local(0.3, DESK.height + 0.016, 0.3))
  parts.add('steel', new CylinderGeometry(0.04, 0.035, 0.1, 20), local(0.5, DESK.height + 0.05, -0.52))
  addChair(parts, local(-0.62 - random() * 0.15, 0, (random() - 0.5) * 0.3, (random() - 0.5) * 0.9))
}

export interface Consoles {
  object: Group
  update: (time: number) => void
  dispose: () => void
}

export function createConsoles(kit: MaterialKit): Consoles {
  const parts = new Assembly<MaterialName>()
  const screens = new Group()
  const materials = new Map<string, ScreenMaterial>()
  const random = seededRandom(1203)
  addDesk(parts)
  const stations: Workstation[] = [
    { angle: consoleAngles.matches, center: 'matches', sides: ['terminal', 'statistics'] },
    { angle: consoleAngles.records, center: 'records', sides: ['matches', 'terminal'] },
    { angle: consoleAngles.statistics, center: 'statistics', sides: ['records', 'memory'] },
  ]
  for (const station of stations) addWorkstation(parts, screens, materials, station, random)

  // 屏幕的光照在桌面和座椅上：用一盏青白色的点光代替九块屏各自的光。挂高一些，三个工位受光才均匀。
  const glow = new PointLight(palette.glow, 24, 8, 1.8)
  glow.position.copy(polar(180 * DEG, 8.2, 2.7))
  const object = new Group()
  object.add(parts.build(kit.materials), screens, glow)
  return {
    object,
    update: (time) => materials.forEach((material) => material.update(time)),
    dispose: () => materials.forEach((material) => material.material.dispose()),
  }
}
