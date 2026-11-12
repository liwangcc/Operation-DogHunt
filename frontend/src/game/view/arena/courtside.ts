// 场边：远侧边线外的技术台（正面是一条 LED 屏）和两队的替补席，席上坐着穿队色的替补和工作人员。
import { BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, type BufferGeometry, type ShaderMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MaterialKit } from '@/startup/materials/kit'
import { COURT } from '../../sim/constants'
import { TEAM_COLORS } from '../athlete/model'
import { createBoardMaterial } from './boards'

/** 技术台和替补席离远侧边线的距离。 */
const OFFSET = 1.75
const TABLE_HALF = 4.2
const CHAIR_GAP = 0.66

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))
  parts.forEach((part) => part.dispose())
  return geometry
}

/** 折叠椅：坐垫、靠背和四条腿。面朝 +z。 */
function chairShape(): BufferGeometry {
  const legs = [-0.2, 0.2].flatMap((x) => [-0.17, 0.17].map((z) => new BoxGeometry(0.03, 0.44, 0.03).translate(x, 0.22, z)))
  return merged([new BoxGeometry(0.46, 0.05, 0.42).translate(0, 0.46, 0), new BoxGeometry(0.46, 0.4, 0.04).translate(0, 0.72, -0.2), ...legs])
}

/** 坐着的人：躯干、头、大腿和小腿，比观众高大一些。面朝 +z。 */
function sitterShapes(): { body: BufferGeometry; head: BufferGeometry; legs: BufferGeometry } {
  const torso = new CylinderGeometry(0.23, 0.19, 0.56, 10).scale(1, 1, 0.64).translate(0, 0.84, -0.02)
  const shoulders = new SphereGeometry(0.23, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 0.64).translate(0, 1.12, -0.02)
  const thighs = new BoxGeometry(0.4, 0.15, 0.48).translate(0, 0.55, 0.2)
  const shins = new BoxGeometry(0.38, 0.5, 0.15).translate(0, 0.26, 0.42)
  return { body: merged([torso, shoulders]), head: new SphereGeometry(0.115, 12, 9).translate(0, 1.3, 0), legs: merged([thighs, shins]) }
}

export interface Courtside {
  object: Group
  /** 技术台正面的屏，由球馆统一推进动画和闪光。 */
  screens: ShaderMaterial[]
  dispose: () => void
}

export function createCourtside(kit: MaterialKit): Courtside {
  const object = new Group()
  const z = -(COURT.halfWidth + OFFSET)
  const owned: Array<{ dispose: () => void }> = []
  // 技术台：台面、正面的屏、台后的三位工作人员。
  const desk = new Mesh(new BoxGeometry(TABLE_HALF * 2, 0.78, 0.7), kit.materials.blackMetal)
  desk.position.set(0, 0.39, z)
  desk.castShadow = true
  const top = new Mesh(new BoxGeometry(TABLE_HALF * 2 + 0.1, 0.04, 0.8), kit.materials.darkStone)
  top.position.set(0, 0.8, z)
  const screenMaterial = createBoardMaterial(TABLE_HALF * 2)
  const screen = new Mesh(new PlaneGeometry(TABLE_HALF * 2 - 0.1, 0.62), screenMaterial)
  screen.position.set(0, 0.4, z + 0.36)
  object.add(desk, top, screen)
  owned.push(screenMaterial)

  // 席位：技术台后三人，两侧各八把椅子，每队五名替补。
  const seats: Array<{ x: number; z: number; team: number }> = []
  for (const x of [-2.2, 0, 2.2]) seats.push({ x, z: z - 0.75, team: -1 })
  const chairs: Array<{ x: number; z: number }> = seats.map(({ x, z: at }) => ({ x, z: at }))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i += 1) {
      const x = side * (TABLE_HALF + 1.1 + i * CHAIR_GAP)
      chairs.push({ x, z })
      if (i < 5) seats.push({ x, z, team: side < 0 ? 0 : 1 })
    }
  }
  const dummy = new Object3D()
  const fill = (mesh: InstancedMesh, spots: Array<{ x: number; z: number }>): InstancedMesh => {
    spots.forEach((spot, index) => {
      dummy.position.set(spot.x, 0, spot.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.castShadow = true
    object.add(mesh)
    return mesh
  }
  fill(new InstancedMesh(chairShape(), kit.materials.plastic, chairs.length), chairs)
  const shapes = sitterShapes()
  const cloth = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 })
  const dark = new MeshStandardMaterial({ color: 0x12161d, roughness: 0.6, metalness: 0.3 })
  owned.push(cloth, dark)
  const bodies = fill(new InstancedMesh(shapes.body, cloth, seats.length), seats)
  fill(new InstancedMesh(shapes.head, dark, seats.length), seats)
  fill(new InstancedMesh(shapes.legs, dark, seats.length), seats)
  const tint = new Color()
  seats.forEach((seat, index) => bodies.setColorAt(index, tint.set(seat.team < 0 ? 0x2a323c : TEAM_COLORS[seat.team])))
  return {
    object,
    screens: [screenMaterial],
    dispose: () => {
      owned.forEach((item) => item.dispose())
      object.traverse((node) => (node as Mesh).geometry?.dispose())
    },
  }
}
