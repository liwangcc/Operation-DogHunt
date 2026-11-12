// 右侧的休息区：皮沙发、两把单人椅、石面茶几、地毯、落地灯，以及房间各处的盆栽。
import { CylinderGeometry, Group, Matrix4, PointLight, TorusGeometry } from 'three'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { Assembly } from './assembly'
import { rbox } from './build'
import { DEG, palette, polar, radialMatrix, seededRandom } from './layout'
import { addBasketball, addPlant } from './props'

type Parts = Assembly<MaterialName>

/** 沙发或单人椅：width 是座位总宽。本地 +x 是靠背一侧，坐的人面朝 -x。 */
function addSeating(parts: Parts, place: Matrix4, width: number, seats: number): void {
  const local = (x: number, y: number, z: number, tilt = 0) => {
    const matrix = place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
    return tilt === 0 ? matrix : matrix.multiply(new Matrix4().makeRotationZ(tilt))
  }
  parts.add('leather', rbox(0.96, 0.2, width, 0.05, 4), local(0, 0.25, 0))
  parts.add('leather', rbox(0.26, 0.56, width, 0.09, 4), local(0.37, 0.6, 0))
  const seatWidth = (width - 0.44) / seats
  for (let i = 0; i < seats; i += 1) {
    const z = -(width - 0.44) / 2 + seatWidth * (i + 0.5)
    parts.add('leather', rbox(0.7, 0.17, seatWidth - 0.03, 0.065, 4), local(-0.1, 0.43, z))
    parts.add('leather', rbox(0.2, 0.44, seatWidth - 0.05, 0.085, 4), local(0.2, 0.69, z, -0.16))
  }
  for (const side of [1, -1]) {
    parts.add('leather', rbox(0.96, 0.4, 0.2, 0.07, 4), local(0, 0.45, side * (width / 2 - 0.1)))
    for (const x of [-0.38, 0.38]) parts.add('steel', rbox(0.04, 0.14, 0.04, 0.008), local(x, 0.08, side * (width / 2 - 0.1)))
  }
}

/** 圆茶几：黑色石面、拉丝钢圈和三条细腿，上面放着一颗篮球和一块平板。 */
function addCoffeeTable(parts: Parts, place: Matrix4): void {
  const local = (x: number, y: number, z: number) => place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
  parts.add('darkStone', new CylinderGeometry(0.58, 0.58, 0.035, 64), local(0, 0.4, 0))
  parts.add('steel', new TorusGeometry(0.58, 0.014, 8, 64).rotateX(Math.PI / 2), local(0, 0.382, 0))
  for (let i = 0; i < 3; i += 1) {
    const turn = (i / 3) * Math.PI * 2 + 0.4
    parts.add('steel', new CylinderGeometry(0.014, 0.014, 0.38, 10), local(Math.cos(turn) * 0.46, 0.19, Math.sin(turn) * 0.46))
  }
  parts.add('steel', new TorusGeometry(0.06, 0.008, 8, 24).rotateX(Math.PI / 2), local(0.14, 0.426, -0.1))
  addBasketball(parts, local(0.14, 0.418 + 0.11, -0.1).multiply(new Matrix4().makeRotationY(0.7)).multiply(new Matrix4().makeRotationX(0.5)))
  parts.add('blackMetal', rbox(0.27, 0.009, 0.19, 0.004), local(-0.18, 0.423, 0.2).multiply(new Matrix4().makeRotationY(0.5)))
}

/** 落地灯：圆盘底座、细杆和发着暖光的灯筒。 */
function addFloorLamp(parts: Parts, place: Matrix4): void {
  const local = (x: number, y: number, z: number) => place.clone().multiply(new Matrix4().makeTranslation(x, y, z))
  parts.add('gunmetal', new CylinderGeometry(0.17, 0.18, 0.025, 32), local(0, 0.012, 0))
  parts.add('steel', new CylinderGeometry(0.012, 0.012, 1.62, 10), local(0, 0.83, 0))
  parts.add('gunmetal', new CylinderGeometry(0.11, 0.11, 0.03, 24), local(0, 1.665, 0))
  parts.add('ledAmber', new CylinderGeometry(0.1, 0.1, 0.34, 24), local(0, 1.48, 0))
  parts.add('gunmetal', new CylinderGeometry(0.11, 0.11, 0.02, 24), local(0, 1.3, 0))
}

export function createLounge(kit: MaterialKit): Group {
  const parts = new Assembly<MaterialName>()
  const random = seededRandom(305)
  parts.add('fabric', new CylinderGeometry(2.35, 2.35, 0.012, 72), new Matrix4().makeTranslation(...polar(0, 7.75, 0.006).toArray()))
  addSeating(parts, radialMatrix(0, 8.8), 2.7, 3)
  // 两把单人椅朝茶几转过去一些。
  addSeating(parts, radialMatrix(19 * DEG, 7.75, 0, -1.05), 0.98, 1)
  addSeating(parts, radialMatrix(-19 * DEG, 7.75, 0, 1.05), 0.98, 1)
  addCoffeeTable(parts, radialMatrix(0, 7.35))
  addFloorLamp(parts, radialMatrix(-24 * DEG, 9.05))
  for (const [degrees, radius, scale] of [[31, 9.1, 1], [-33, 9.12, 1.08], [143, 9.1, 1.05], [217, 9.1, 0.96]]) {
    addPlant(parts, radialMatrix(degrees * DEG, radius, 0, random() * 6), random, scale)
  }

  const lamp = new PointLight(palette.warm, 22, 8, 1.8)
  lamp.position.copy(polar(-24 * DEG, 8.9, 1.5))
  const group = new Group()
  group.add(parts.build(kit.materials), lamp)
  return group
}
