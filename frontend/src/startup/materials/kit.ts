// 材质库：整个场景共用的一套物理材质与发光材质，集中管理便于统一调色和释放。
import { Color, DoubleSide, MeshBasicMaterial, type Material, type WebGLRenderer } from 'three'
import { palette } from '../scene/layout'
import { TextureForge } from '../textures/forge'
import { bakeSurfaces, type SurfaceTextures } from '../textures/surfaces'
import { surfaceMaterial } from './surface'

/** 发光体颜色乘以亮度倍数后超过 1，泛光只会从这些地方溢出。 */
function glow(color: number, intensity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) })
}

function createSolids(t: SurfaceTextures) {
  return {
    /** 浅色拉丝钢：包边、拉手、灯具外圈。 */
    steel: surfaceMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.34 }, { map: t.brushed, scale: 1.6, bump: 0.5, rough: 0.5, tint: 0.3 }),
    /** 深色枪灰金属：窗框、桌体、梁。 */
    gunmetal: surfaceMaterial({ color: 0x252b33, metalness: 0.92, roughness: 0.4 }, { map: t.brushed, scale: 1.2, bump: 0.42, rough: 0.5, tint: 0.3 }),
    /** 近黑的阳极氧化件：设备外壳、踢脚、暗槽。 */
    blackMetal: surfaceMaterial({ color: 0x0c0e12, metalness: 0.85, roughness: 0.46 }, { map: t.anodized, scale: 1.4, bump: 0.3, rough: 0.6, tint: 0.4 }),
    /** 墙面与吊顶的深蓝灰喷涂板。 */
    panel: surfaceMaterial({ color: 0x18212d, metalness: 0.25, roughness: 0.58 }, { map: t.anodized, scale: 0.9, bump: 0.35, rough: 0.55, tint: 0.5 }),
    /** 吊顶的穿孔吸音板。 */
    acoustic: surfaceMaterial({ color: 0x10151c, metalness: 0.1, roughness: 0.9 }, { map: t.perforated, scale: 2.2, bump: 0.7, rough: 0.2, tint: 0.45 }),
    /** 镜面铬：细杆、灯具反光罩。 */
    chrome: surfaceMaterial({ color: 0xd4dae0, metalness: 1, roughness: 0.12 }, { map: t.smudge, scale: 2.2, bump: 0.2, rough: 0.35, tint: 0.1 }),
    /** 干邑色皮革：沙发。 */
    leather: surfaceMaterial({ color: 0x4a2b18, metalness: 0, roughness: 0.48, sheen: 0.3, sheenRoughness: 0.5, sheenColor: 0x8a5a36 }, { map: t.leather, scale: 2.4, bump: 0.75, rough: 0.5, tint: 0.5 }),
    /** 黑色皮革：座椅。 */
    blackLeather: surfaceMaterial({ color: 0x101114, metalness: 0, roughness: 0.5 }, { map: t.leather, scale: 3.2, bump: 0.7, rough: 0.5, tint: 0.4 }),
    /** 深灰织物：椅背网面、地毯。 */
    fabric: surfaceMaterial({ color: 0x1b2028, metalness: 0, roughness: 0.92 }, { map: t.fabric, scale: 2.6, bump: 0.8, rough: 0.2, tint: 0.6 }),
    /** 哑光塑料/橡胶：显示器外壳、脚轮、键帽。 */
    plastic: surfaceMaterial({ color: 0x0d0f13, metalness: 0.05, roughness: 0.52 }, { map: t.matte, scale: 3, bump: 0.3, rough: 0.4, tint: 0.3 }),
    /** 黑色抛光石材：茶几台面、桌面包边。 */
    darkStone: surfaceMaterial({ color: 0x14171c, metalness: 0, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15 }, { map: t.stone, scale: 0.7, bump: 0.2, rough: 0.5, tint: 0.9 }),
    /** 烟色玻璃：桌面、设备面板，表面带擦拭痕迹。 */
    smokedGlass: surfaceMaterial({ color: 0x05080b, metalness: 0, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.5 }, { map: t.smudge, scale: 0.9, bump: 0.08, rough: 0.5, tint: 0 }),
    /** 植物叶片与花盆土。 */
    leaf: surfaceMaterial({ color: 0x1d4a34, metalness: 0, roughness: 0.46, sheen: 0.4, sheenColor: 0x4f8f62, side: DoubleSide }, { map: t.matte, scale: 6, bump: 0.5, rough: 0.5, tint: 0.7 }),
    soil: surfaceMaterial({ color: 0x1a1410, metalness: 0, roughness: 1 }, { map: t.matte, scale: 5, bump: 1, rough: 0.2, tint: 0.8 }),
    /** 篮球皮面。 */
    ball: surfaceMaterial({ color: 0xb4521f, metalness: 0, roughness: 0.62 }, { map: t.pebble, scale: 9, bump: 0.9, rough: 0.4, tint: 0.5 }),
  }
}

function createLights() {
  return {
    /** 主色青光灯带（高亮，会溢出泛光）。 */
    ledTeal: glow(palette.glow, 4.5),
    /** 较暗的青光：细线、指示。 */
    ledTealDim: glow(palette.glow, 1.3),
    /** 暖色灯带。 */
    ledAmber: glow(palette.warm, 4.2),
    ledAmberDim: glow(palette.warm, 1.2),
    /** 接近白色的照明灯面。 */
    ledWhite: glow(palette.white, 5),
    /** 设备指示灯。 */
    ledRed: glow(palette.alert, 3),
    ledGreen: glow(0x4dff9a, 2.4),
    /** 完全不反光的黑：缝隙、格栅深处。 */
    void: new MeshBasicMaterial({ color: 0x010203 }),
  }
}

export type SolidName = keyof ReturnType<typeof createSolids>
export type LightName = keyof ReturnType<typeof createLights>
export type MaterialName = SolidName | LightName

export interface MaterialKit {
  /** 表面细节贴图，供地面等特殊材质复用。 */
  textures: SurfaceTextures
  materials: Record<MaterialName, Material>
  dispose: () => void
}

export function createMaterialKit(renderer: WebGLRenderer, textureSize: number): MaterialKit {
  const forge = new TextureForge(renderer)
  const textures = bakeSurfaces(forge, textureSize)
  const materials: Record<MaterialName, Material> = { ...createSolids(textures), ...createLights() }
  return {
    textures,
    materials,
    dispose: () => {
      Object.values(materials).forEach((material) => material.dispose())
      forge.dispose()
    },
  }
}
