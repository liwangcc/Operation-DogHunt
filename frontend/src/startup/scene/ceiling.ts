// 吊顶：放射状的梁、战术桌正上方悬吊的环形灯、中央全息投影机和一圈筒灯。
import { CylinderGeometry, Group, Matrix4 } from 'three'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { Assembly } from './assembly'
import { rbox, ringBlock } from './build'
import { DEG, radialMatrix, room } from './layout'

const RIBS = 16
/** 环形灯的中心半径与底面高度；主光源就藏在它的中心。 */
export const halo = { radius: 3.15, height: 6.95 } as const
/** 中央投影机镜片的高度，全息光柱从这里向下照。 */
export const PROJECTOR_LENS_HEIGHT = 7.26

/** 每根梁分两段：贴着斜顶的斜段和平顶下的水平段，与窗框立柱在同一方位上，形成连续的结构线。 */
function addRibs(parts: Assembly<MaterialName>): void {
  const coveBase = room.headerHeight + 0.45
  const run = room.headerRadius + 0.1 - room.coveInnerRadius
  const rise = room.ceilingHeight - coveBase
  const slope = Math.atan(rise / run)
  const length = Math.hypot(run, rise)
  for (let i = 0; i < RIBS; i += 1) {
    const angle = (i / RIBS) * Math.PI * 2
    const middleRadius = room.coveInnerRadius + run / 2
    const middleHeight = coveBase + rise / 2 - 0.14
    parts.add('gunmetal', rbox(length, 0.24, 0.15, 0.02), radialMatrix(angle, middleRadius, middleHeight, 0, -slope))
    parts.add('gunmetal', rbox(2.9, 0.24, 0.15, 0.02), radialMatrix(angle, 4.95, room.ceilingHeight - 0.12))
    parts.add('steel', rbox(2.7, 0.012, 0.05, 0.004), radialMatrix(angle, 4.95, room.ceilingHeight - 0.246))
  }
  parts.add('gunmetal', ringBlock(room.coveInnerRadius - 0.12, room.coveInnerRadius + 0.12, room.ceilingHeight - 0.3, room.ceilingHeight, 0.02))
  parts.add('gunmetal', ringBlock(3.42, 3.62, room.ceilingHeight - 0.3, room.ceilingHeight, 0.02))
}

/** 悬吊的环形灯：深色灯体，底面是发光的柔光罩，内圈压一条青色细线，用镀铬细杆吊在平顶下。 */
function addHalo(parts: Assembly<MaterialName>): void {
  const { radius, height } = halo
  parts.add('gunmetal', ringBlock(radius - 0.2, radius + 0.2, height + 0.012, height + 0.19, 0.03))
  parts.add('ledWhite', ringBlock(radius - 0.14, radius + 0.14, height, height + 0.012, 0.003))
  parts.add('ledTeal', ringBlock(radius - 0.218, radius - 0.2, height + 0.07, height + 0.1, 0.003))
  parts.add('steel', ringBlock(radius + 0.2, radius + 0.212, height + 0.05, height + 0.15, 0.003))
  for (let i = 0; i < 8; i += 1) {
    const rod = new CylinderGeometry(0.011, 0.011, room.ceilingHeight - height - 0.19, 8)
    parts.add('chrome', rod, radialMatrix(((i + 0.5) / 8) * Math.PI * 2, radius, (room.ceilingHeight + height + 0.19) / 2))
  }
}

/** 中央全息投影机：吊杆、机身、镜筒和发光镜片，四周带四个小的辅助镜头。 */
function addProjector(parts: Assembly<MaterialName>): void {
  const top = room.ceilingHeight
  const at = (y: number) => new Matrix4().makeTranslation(0, y, 0)
  parts.add('gunmetal', new CylinderGeometry(0.55, 0.55, 0.05, 48), at(top - 0.025))
  parts.add('blackMetal', new CylinderGeometry(0.07, 0.07, 0.95, 20), at(top - 0.5))
  parts.add('gunmetal', new CylinderGeometry(0.36, 0.4, 0.34, 48), at(7.62))
  parts.add('steel', new CylinderGeometry(0.405, 0.405, 0.03, 48), at(7.7))
  parts.add('blackMetal', new CylinderGeometry(0.24, 0.3, 0.18, 40), at(7.36))
  parts.add('ledTeal', new CylinderGeometry(0.17, 0.17, 0.012, 40), at(PROJECTOR_LENS_HEIGHT))
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 45 * DEG
    parts.add('blackMetal', new CylinderGeometry(0.05, 0.06, 0.1, 16), radialMatrix(angle, 0.3, 7.42))
    parts.add('ledTealDim', new CylinderGeometry(0.035, 0.035, 0.008, 16), radialMatrix(angle, 0.3, 7.368))
  }
}

/** 梁与梁之间的筒灯：一圈金属套环里嵌着发光面。 */
function addDownlights(parts: Assembly<MaterialName>): void {
  for (let i = 0; i < RIBS; i += 1) {
    const angle = ((i + 0.5) / RIBS) * Math.PI * 2
    for (const radius of [4.5, 5.6]) {
      parts.add('steel', new CylinderGeometry(0.085, 0.085, 0.02, 20), radialMatrix(angle, radius, room.ceilingHeight - 0.01))
      parts.add('ledWhite', new CylinderGeometry(0.06, 0.06, 0.006, 20), radialMatrix(angle, radius, room.ceilingHeight - 0.022))
    }
  }
}

export function createCeiling(kit: MaterialKit): Group {
  const parts = new Assembly<MaterialName>()
  addRibs(parts)
  addHalo(parts)
  addProjector(parts)
  addDownlights(parts)
  // 吊顶上的构件都在主光源上方，不参与投影，省掉一部分阴影计算。
  return parts.build(kit.materials, { cast: false, receive: false })
}
