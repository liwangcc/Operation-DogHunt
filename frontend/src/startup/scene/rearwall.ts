// 镜头背后那面实墙上的内容：发光的项目标识、一排服务器机柜、双开门和墙面控制面板。
import {
  BackSide,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
} from 'three'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { createScreenMaterial, type ScreenMaterial } from '../materials/screen'
import { EMBLEM_ASPECT, createEmblemTexture } from '../textures/emblem'
import { Assembly } from './assembly'
import { rbox, ringBlock } from './build'
import { DEG, palette, polar, radialMatrix, room, seededRandom } from './layout'
import { RACK_ANGLE, SETTINGS_ANGLE } from './stations'

type Parts = Assembly<MaterialName>

/** 朝向房间中心的平面屏幕：place 的 +x 指向墙外。 */
function wallScreen(material: ScreenMaterial, place: Matrix4, width: number, height: number): Mesh {
  const screen = new Mesh(new PlaneGeometry(width, height), material.material)
  screen.applyMatrix4(place.clone().multiply(new Matrix4().makeRotationY(-Math.PI / 2)))
  return screen
}

/** 贴着弧形墙面的发光标识。圆柱面从室内看是镜像的，所以把贴图坐标左右翻转。 */
function createEmblem(): { mesh: Mesh; dispose: () => void } {
  const width = 5.6
  const radius = room.radius - 0.03
  const sweep = width / radius
  // 圆柱几何体的角度从 +z 轴起算，比房间的方位角多 90°。
  const geometry = new CylinderGeometry(radius, radius, width / EMBLEM_ASPECT, 48, 1, true, 270 * DEG + Math.PI / 2 - sweep / 2, sweep)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i))
  const texture = createEmblemTexture()
  const material = new MeshBasicMaterial({ map: texture, color: new Color(palette.glow).lerp(new Color(0xffffff), 0.35).multiplyScalar(2.3), side: BackSide })
  const mesh = new Mesh(geometry, material)
  mesh.position.y = 3.55
  return {
    mesh,
    dispose: () => {
      texture.dispose()
      material.dispose()
    },
  }
}

function addEmblemFrame(parts: Parts): void {
  const half = (5.6 / (room.radius - 0.03) / 2) * 1.03
  const arc = { from: 270 * DEG - half, to: 270 * DEG + half }
  const bottom = 3.55 - 5.6 / EMBLEM_ASPECT / 2
  const top = 3.55 + 5.6 / EMBLEM_ASPECT / 2
  parts.add('steel', ringBlock(room.radius - 0.05, room.radius, bottom - 0.05, bottom - 0.02, 0.004, arc))
  parts.add('steel', ringBlock(room.radius - 0.05, room.radius, top + 0.02, top + 0.05, 0.004, arc))
  for (const angle of [arc.from, arc.to]) parts.add('steel', rbox(0.05, top - bottom + 0.1, 0.03, 0.004), radialMatrix(angle, room.radius - 0.025, 3.55))
}

/** 一台机柜：柜体、网孔门、把手和几排状态灯。 */
function addRack(parts: Parts, place: Matrix4, random: () => number): void {
  const local = (x: number, y: number, z: number) => place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
  parts.add('blackMetal', rbox(0.9, 2.3, 0.7, 0.012), local(0, 1.17, 0))
  parts.add('gunmetal', rbox(0.02, 2.2, 0.66, 0.006), local(-0.455, 1.17, 0))
  parts.add('acoustic', rbox(0.012, 2.02, 0.54, 0.004), local(-0.463, 1.17, -0.03))
  parts.add('steel', rbox(0.02, 0.32, 0.02, 0.006), local(-0.475, 1.2, 0.285))
  const lamps: MaterialName[] = ['ledGreen', 'ledGreen', 'ledTealDim', 'ledTealDim', 'ledAmberDim', 'ledRed']
  for (let row = 0; row < 15; row += 1) {
    const count = 2 + Math.floor(random() * 4)
    for (let i = 0; i < count; i += 1) {
      const lamp = lamps[Math.floor(random() * lamps.length)]
      parts.add(lamp, rbox(0.006, 0.012, 0.014, 0.002), local(-0.471, 0.3 + row * 0.126, -0.26 + random() * 0.46))
    }
  }
}

function addRacks(parts: Parts, random: () => number): void {
  const spacing = 6.5 * DEG
  for (let i = 0; i < 4; i += 1) {
    const angle = RACK_ANGLE + (i - 1.5) * spacing
    addRack(parts, radialMatrix(angle, 9.5), random)
    if (i < 3) parts.add('ledTealDim', rbox(0.02, 2.3, 0.024, 0.004), radialMatrix(angle + spacing / 2, 9.06, 1.17))
  }
  const arc = { from: RACK_ANGLE - 2.2 * spacing, to: RACK_ANGLE + 2.2 * spacing }
  parts.add('gunmetal', ringBlock(9.04, 9.97, 2.4, 2.48, 0.01, arc))
  parts.add('ledTeal', ringBlock(9.06, 9.08, 2.385, 2.4, 0.002, arc))
}

/** 双开门：钢门框、两扇带观察窗的门，门楣上一条绿色状态灯，旁边是门禁面板。 */
function addDoor(parts: Parts, place: Matrix4): void {
  const local = (x: number, y: number, z: number) => place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
  for (const side of [1, -1]) {
    parts.add('steel', rbox(0.2, 2.66, 0.14, 0.012), local(-0.04, 1.33, side * 0.9))
    parts.add('gunmetal', rbox(0.07, 2.5, 0.8, 0.01), local(-0.03, 1.27, side * 0.41))
    parts.add('smokedGlass', rbox(0.074, 1.1, 0.11, 0.008), local(-0.03, 1.7, side * 0.5))
    parts.add('steel', rbox(0.03, 0.42, 0.03, 0.008), local(-0.08, 1.15, side * 0.1))
  }
  parts.add('steel', rbox(0.2, 0.14, 1.94, 0.012), local(-0.04, 2.66, 0))
  parts.add('void', rbox(0.072, 2.5, 0.012, 0.002), local(-0.03, 1.27, 0))
  parts.add('ledGreen', rbox(0.03, 0.03, 1.2, 0.004), local(-0.13, 2.66, 0))
  parts.add('blackMetal', rbox(0.04, 0.24, 0.14, 0.008), local(-0.02, 1.32, -1.2))
  parts.add('ledTealDim', rbox(0.004, 0.09, 0.1, 0.002), local(-0.042, 1.37, -1.2))
}

/** 墙面控制面板的外壳与下方的按键搁板；屏幕另行创建。 */
function addControlPanel(parts: Parts, place: Matrix4): void {
  const local = (x: number, y: number, z: number) => place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
  parts.add('blackMetal', rbox(0.1, 0.78, 1.24, 0.02), local(0, 1.5, 0))
  parts.add('steel', rbox(0.012, 0.8, 0.012, 0.003), local(-0.05, 1.5, 0.626))
  parts.add('steel', rbox(0.012, 0.8, 0.012, 0.003), local(-0.05, 1.5, -0.626))
  parts.add('gunmetal', rbox(0.24, 0.035, 1.04, 0.01), local(-0.1, 1.04, 0))
  for (let key = 0; key < 9; key += 1) parts.add('plastic', rbox(0.06, 0.014, 0.07, 0.005), local(-0.12, 1.064, -0.4 + key * 0.1))
  parts.add('ledAmberDim', rbox(0.02, 0.006, 0.9, 0.002), local(-0.2, 1.06, 0))
}

export interface RearWall {
  object: Group
  update: (time: number) => void
  dispose: () => void
}

export function createRearWall(kit: MaterialKit): RearWall {
  const parts = new Assembly<MaterialName>()
  const random = seededRandom(977)
  addEmblemFrame(parts)
  addRacks(parts, random)
  addDoor(parts, radialMatrix(303 * DEG, room.radius - 0.02))
  const panelPlace = radialMatrix(SETTINGS_ANGLE, room.radius - 0.06)
  addControlPanel(parts, panelPlace)

  const emblem = createEmblem()
  const settings = createScreenMaterial('settings', 1.06 / 0.62)
  const memory = createScreenMaterial('memory', 2.8 / 0.56, 1.4)
  const settingsScreen = wallScreen(settings, panelPlace.clone().multiply(new Matrix4().makeTranslation(-0.052, 1.5, 0)), 1.06, 0.62)
  // 机柜上方的长条屏：一圈圈扩散的点阵，表示正在被调取的长期记忆。
  const memoryPlace = radialMatrix(RACK_ANGLE, room.radius - 0.05, 3.05)
  parts.add('blackMetal', rbox(0.05, 0.62, 2.9, 0.012), memoryPlace)
  const memoryScreen = wallScreen(memory, memoryPlace.clone().multiply(new Matrix4().makeTranslation(-0.027, 0, 0)), 2.8, 0.56)

  // 标识和机柜的光洒在附近的地面与墙上。
  const emblemGlow = new PointLight(palette.glow, 30, 9, 1.8)
  emblemGlow.position.copy(polar(270 * DEG, 8.6, 3.4))
  const rackGlow = new PointLight(palette.glow, 9, 5, 1.8)
  rackGlow.position.copy(polar(RACK_ANGLE, 8.4, 1.6))

  const object = new Group()
  object.add(parts.build(kit.materials), emblem.mesh, settingsScreen, memoryScreen, emblemGlow, rackGlow)
  return {
    object,
    update: (time) => {
      settings.update(time)
      memory.update(time)
    },
    dispose: () => {
      emblem.dispose()
      settings.material.dispose()
      memory.material.dispose()
    },
  }
}
