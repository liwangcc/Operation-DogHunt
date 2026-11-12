// 房间外壳：地面、窗下矮台、窗框与玻璃、窗楣、斜顶和平顶，以及镜头背后的实墙墙面。
import { CircleGeometry, Color, Group, Mesh } from 'three'
import { createFloorMaterial, type FloorMaterial } from '../materials/floor'
import { createGlassMaterial, type GlassMaterial } from '../materials/glass'
import type { MaterialKit, MaterialName } from '../materials/kit'
import { surfaceMaterial } from '../materials/surface'
import { Assembly } from './assembly'
import { rbox, revolve, ringBlock } from './build'
import { DEG, glassArc, palette, radialMatrix, room } from './layout'

const windowRise = room.headerHeight - room.sillHeight
const windowLean = Math.atan((room.headerRadius - room.radius) / windowRise)
const BAY = 22.5 * DEG
const wallArc = { from: room.wallFrom, to: room.wallTo }

/** 窗下矮台：踢脚凹槽里藏一条暖色灯带，台面是出风格栅。 */
function addSill(parts: Assembly<MaterialName>): void {
  const inner = room.radius - room.sillDepth
  parts.add('blackMetal', ringBlock(inner + 0.07, room.radius + 0.1, 0, 0.07, 0.004, glassArc))
  parts.add('ledAmber', ringBlock(inner + 0.075, inner + 0.095, 0.02, 0.05, 0.002, glassArc))
  parts.add('gunmetal', ringBlock(inner, room.radius + 0.1, 0.07, room.sillHeight, 0.014, glassArc))
  parts.add('acoustic', ringBlock(inner + 0.12, room.radius - 0.1, room.sillHeight, room.sillHeight + 0.004, 0.001, glassArc))
  parts.add('steel', ringBlock(inner - 0.004, inner + 0.004, room.sillHeight - 0.05, room.sillHeight - 0.02, 0.001, glassArc))
}

/** 向外倾斜的窗框立柱：深色主体，朝室内一侧压一条拉丝钢饰条，底部有柱脚。 */
function addMullions(parts: Assembly<MaterialName>): void {
  const length = Math.hypot(windowRise, room.headerRadius - room.radius)
  const middle = room.sillHeight + windowRise / 2
  const radius = (room.radius + room.headerRadius) / 2
  const bays = Math.round((glassArc.to - glassArc.from) / BAY)
  for (let i = 0; i <= bays; i += 1) {
    const angle = glassArc.from + i * BAY
    parts.add('gunmetal', rbox(0.26, length, 0.13, 0.018), radialMatrix(angle, radius, middle, 0, -windowLean))
    parts.add('steel', rbox(0.022, length - 0.2, 0.05, 0.006), radialMatrix(angle, radius - 0.135, middle, 0, -windowLean))
    parts.add('blackMetal', rbox(0.4, 0.12, 0.22, 0.02), radialMatrix(angle, room.radius - 0.02, room.sillHeight + 0.06))
  }
}

/** 窗楣：一圈横梁，下沿藏着照亮斜顶的灯带。 */
function addHeader(parts: Assembly<MaterialName>): void {
  const y = room.headerHeight
  parts.add('gunmetal', ringBlock(room.headerRadius - 0.3, room.headerRadius + 0.2, y, y + 0.45, 0.02))
  parts.add('steel', ringBlock(room.headerRadius - 0.31, room.headerRadius - 0.3, y + 0.08, y + 0.12, 0.002))
  parts.add('ledAmber', ringBlock(room.headerRadius - 0.42, room.headerRadius - 0.38, y + 0.4, y + 0.43, 0.003))
  parts.add('blackMetal', ringBlock(room.headerRadius - 0.48, room.headerRadius - 0.3, y + 0.32, y + 0.4, 0.006))
}

/** 实墙：一格一格的喷涂板，板缝是细黑槽，上方有一道青色灯缝。 */
function addRearWall(parts: Assembly<MaterialName>): void {
  parts.add('panel', revolve([[room.radius, room.headerHeight], [room.radius, 0]], { ...wallArc, segments: 48 }))
  parts.add('blackMetal', ringBlock(room.radius - 0.05, room.radius + 0.02, 0, 0.14, 0.006, wallArc))
  parts.add('void', ringBlock(room.radius - 0.012, room.radius + 0.02, 5.4, 5.47, 0.001, wallArc))
  parts.add('ledTealDim', ringBlock(room.radius - 0.004, room.radius + 0.02, 5.425, 5.445, 0.001, wallArc))
  const panels = 12
  for (let i = 1; i < panels; i += 1) {
    const angle = wallArc.from + ((wallArc.to - wallArc.from) * i) / panels
    parts.add('void', rbox(0.02, room.headerHeight - 0.3, 0.014, 0.001), radialMatrix(angle, room.radius - 0.004, room.headerHeight / 2))
  }
}

/** 斜顶材质：在喷涂板的基础上加一层自下而上衰减的暖光，模拟窗楣灯带打上来的间接照明。 */
function createCoveMaterial(kit: MaterialKit) {
  return surfaceMaterial(
    { color: 0x18212d, metalness: 0.2, roughness: 0.62 },
    { map: kit.textures.anodized, scale: 0.9, bump: 0.35, rough: 0.5, tint: 0.5 },
    {
      key: 'cove',
      uniforms: { uCoveGlow: { value: new Color(palette.warm) } },
      pars: 'uniform vec3 uCoveGlow;',
      albedo: /* glsl */ `
        float coveRise = clamp((vSurfPos.y - ${(room.headerHeight + 0.4).toFixed(2)}) / ${(room.ceilingHeight - room.headerHeight - 0.4).toFixed(2)}, 0.0, 1.0);
        totalEmissiveRadiance += uCoveGlow * 0.11 * exp(-coveRise * 3.0);
      `,
    },
  )
}

export interface Shell {
  object: Group
  floor: FloorMaterial & { mesh: Mesh }
  glass: GlassMaterial
  dispose: () => void
}

export function createShell(kit: MaterialKit): Shell {
  const parts = new Assembly<MaterialName>()
  addSill(parts)
  addMullions(parts)
  addHeader(parts)
  addRearWall(parts)
  parts.add('acoustic', new CircleGeometry(room.coveInnerRadius + 0.02, 96).rotateX(Math.PI / 2).translate(0, room.ceilingHeight, 0))

  const floor = createFloorMaterial(kit.textures.stone)
  const floorMesh = new Mesh(new CircleGeometry(room.headerRadius + 0.4, 128).rotateX(-Math.PI / 2), floor.material)
  floorMesh.receiveShadow = true

  const glass = createGlassMaterial()
  const glassMesh = new Mesh(
    revolve([[room.headerRadius, room.headerHeight], [room.radius, room.sillHeight]], { ...glassArc, segments: 120 }),
    glass.material,
  )

  const coveMaterial = createCoveMaterial(kit)
  const coveBase = room.headerHeight + 0.45
  const cove = new Mesh(
    revolve([[room.coveInnerRadius, room.ceilingHeight], [room.headerRadius + 0.1, coveBase]], { segments: 96 }),
    coveMaterial,
  )
  cove.receiveShadow = true

  const object = new Group()
  object.add(parts.build(kit.materials), floorMesh, glassMesh, cove)
  return {
    object,
    floor: { ...floor, mesh: floorMesh },
    glass,
    dispose: () => {
      floor.material.dispose()
      glass.material.dispose()
      coveMaterial.dispose()
    },
  }
}
