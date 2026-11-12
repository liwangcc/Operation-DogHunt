// 球员模型：把零件挂到骨架上，配好材质（队色装甲、深色内衬、金属关节、发光灯带），胸前背后贴上号码。
// 造型是没有五官的机械运动员，不参照任何真人；号码避开了有特定指向的数字。
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Group,
  type Material,
  type Texture,
} from 'three'
import type { MaterialKit } from '@/startup/materials/kit'
import { surfaceMaterial } from '@/startup/materials/surface'
import { palette } from '@/startup/scene/layout'
import { paintTexture } from '@/startup/textures/canvas'
import type { Athlete } from '../../sim/types'
import { buildParts, type Slot } from './parts'
import { createSkeleton, frameFor, type Frame, type Skeleton } from './skeleton'

/** 两队的装甲颜色：0 队青色“猎犬”，1 队琥珀色“赤狐”。 */
export const TEAM_COLORS = [0x10a6bd, 0xe0861f] as const

/** 号码按“队伍、位置”分配。 */
const NUMBERS = [[4, 11, 52], [7, 15, 40]] as const

export interface AthleteMaterials {
  /** 每支队伍一套：各个材质槽位对应的材质。 */
  teams: [Record<Slot, Material>, Record<Slot, Material>]
  /** 号码贴花，按“队伍、位置”取。 */
  numbers: Material[][]
  marker: Material
  dispose: () => void
}

function numberTexture(value: number): Texture {
  return paintTexture(128, 128, (ctx, width, height) => {
    // 两位数用小一号的字，不靠横向压扁来塞进去。
    ctx.font = `900 ${value > 9 ? 78 : 100}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 12
    ctx.strokeStyle = 'rgba(6, 10, 14, 0.9)'
    ctx.strokeText(String(value), width / 2, height / 2 + 6)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(value), width / 2, height / 2 + 6)
  })
}

export function createAthleteMaterials(kit: MaterialKit): AthleteMaterials {
  const t = kit.textures
  const owned: Array<{ dispose: () => void }> = []
  const keep = <T extends { dispose: () => void }>(item: T): T => {
    owned.push(item)
    return item
  }
  const suit = keep(surfaceMaterial({ color: 0x0b0d12, metalness: 0.3, roughness: 0.56 }, { map: t.fabric, scale: 22, bump: 0.5, rough: 0.3, tint: 0.4, space: 'object' }))
  const joint = keep(surfaceMaterial({ color: 0x4d545c, metalness: 1, roughness: 0.38 }, { map: t.brushed, scale: 9, bump: 0.3, rough: 0.4, tint: 0.2, space: 'object' }))
  const glass = keep(new MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04 }))
  const white = keep(surfaceMaterial({ color: 0xdfe4e8, metalness: 0.1, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }, { map: t.matte, scale: 12, bump: 0.3, rough: 0.3, tint: 0.2, space: 'object' }))
  const shell = keep(surfaceMaterial({ color: 0x2b323c, metalness: 0.8, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.25 }, { map: t.anodized, scale: 7, bump: 0.2, rough: 0.4, tint: 0.3, space: 'object' }))
  const teams = TEAM_COLORS.map((color): Record<Slot, Material> => ({
    suit, shell, joint, glass, white,
    armor: keep(surfaceMaterial({ color, metalness: 0.45, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 }, { map: t.anodized, scale: 7, bump: 0.15, rough: 0.35, tint: 0.25, space: 'object' })),
    trim: keep(surfaceMaterial({ color: new Color(color).multiplyScalar(0.3), metalness: 0.7, roughness: 0.38 }, { map: t.anodized, scale: 7, bump: 0.2, rough: 0.4, tint: 0.3, space: 'object' })),
    glow: keep(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(3.2) })),
  })) as [Record<Slot, Material>, Record<Slot, Material>]
  const numbers = NUMBERS.map((row) =>
    row.map((value) => {
      const map = keep(numberTexture(value))
      // 贴花紧贴在胸甲外面：用深度偏移避免和装甲表面互相闪烁。
      return keep(new MeshStandardMaterial({ map, transparent: true, alphaTest: 0.35, roughness: 0.5, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }))
    }),
  )
  const marker = keep(new MeshBasicMaterial({ color: new Color(palette.glow).multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false }))
  return { teams, numbers, marker, dispose: () => owned.forEach((item) => item.dispose()) }
}

/** 贴在胸甲（椭圆柱面）上的一小块曲面，用来放号码。back 为 true 时贴在背后。 */
function numberPatch(frame: Frame, size: number, height: number, back: boolean): BufferGeometry {
  const radiusX = 0.2245 * frame.unit * frame.bulk
  const radiusZ = radiusX * 0.64
  const columns = 8
  const span = (size * frame.unit) / radiusX
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= 1; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const across = column / columns
      const angle = (across - 0.5) * span
      const facing = back ? -1 : 1
      positions.push(Math.sin(angle) * radiusX * facing, (height + (row - 0.5) * size) * frame.unit, Math.cos(angle) * radiusZ * facing)
      uvs.push(across, row)
    }
  }
  for (let column = 0; column < columns; column += 1) {
    const a = column
    const b = column + 1
    const c = column + columns + 1
    const d = c + 1
    indices.push(a, b, d, a, d, c)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export interface AthleteModel {
  skeleton: Skeleton
  /** 玩家正在控制这名球员时，脚下亮起的光环。 */
  marker: Mesh
}

export function createAthleteModel(materials: AthleteMaterials, athlete: Athlete): AthleteModel {
  const frame = frameFor(athlete)
  const skeleton = createSkeleton(frame)
  const parts = buildParts(frame)
  const team = materials.teams[athlete.team]
  const dress = (bone: Group, bin: (typeof parts)['pelvis']): void => {
    bone.add(bin.build(team))
  }
  dress(skeleton.pelvis, parts.pelvis)
  dress(skeleton.chest, parts.chest)
  dress(skeleton.head, parts.head)
  for (let index = 0; index < 2; index += 1) {
    dress(skeleton.arms[index].upper, parts.upperArm[index])
    dress(skeleton.arms[index].lower, parts.forearm[index])
    dress(skeleton.arms[index].end, parts.hand[index])
    dress(skeleton.legs[index].upper, parts.thigh[index])
    dress(skeleton.legs[index].lower, parts.shin[index])
    dress(skeleton.legs[index].end, parts.foot[index])
  }
  const decal = materials.numbers[athlete.team][athlete.role]
  skeleton.chest.add(new Mesh(numberPatch(frame, 0.115, 0.365, false), decal), new Mesh(numberPatch(frame, 0.15, 0.355, true), decal))
  const marker = new Mesh(new RingGeometry(0.5, 0.6, 40).rotateX(-Math.PI / 2), materials.marker)
  marker.position.y = 0.02
  marker.visible = false
  skeleton.root.add(marker)
  return { skeleton, marker }
}
