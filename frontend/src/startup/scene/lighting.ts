// 室内灯光：吊顶主光（唯一投射阴影的灯）、战术桌的青色补光、暖色点缀，以及闪电时从窗外打进来的冷光。
import { DirectionalLight, Group, HemisphereLight, PointLight, SpotLight } from 'three'
import { PROJECTOR_LENS_HEIGHT } from './ceiling'
import { palette, polar } from './layout'

export interface Lighting {
  object: Group
  /** 闪电：amount 为 0–1 的瞬时亮度，azimuth 为闪电所在方位。 */
  flash: (amount: number, azimuth: number) => void
}

/** 从中央投影机镜片下方向下照的主光：给桌子、座椅在地面上压出柔和的影子。放在镜片之下，机身才不会挡住它。 */
function createKeyLight(shadowMapSize: number): SpotLight {
  const key = new SpotLight(0xffe9cf, 420, 26, 0.92, 0.85, 1.6)
  key.position.set(0, PROJECTOR_LENS_HEIGHT - 0.1, 0)
  key.target.position.set(0, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 12
  key.shadow.bias = -0.0006
  key.shadow.normalBias = 0.03
  key.shadow.radius = 6
  return key
}

export function createLighting(shadowMapSize: number): Lighting {
  const object = new Group()
  const key = createKeyLight(shadowMapSize)
  // 天空与地面的环境光：极弱，只保证背光面不至于死黑。
  const ambient = new HemisphereLight(0x5f7fb8, 0x15100c, 0.35)
  const tableGlow = new PointLight(palette.glow, 55, 13, 1.8)
  tableGlow.position.set(0, 1.9, 0)
  const haloGlow = new PointLight(palette.warm, 70, 15, 1.8)
  haloGlow.position.set(0, 6.1, 0)
  object.add(key, key.target, ambient, tableGlow, haloGlow)

  const lightning = new DirectionalLight(0xbcd3ff, 0)
  object.add(lightning, lightning.target)
  return {
    object,
    flash: (amount, azimuth) => {
      lightning.intensity = amount * 6
      lightning.position.copy(polar(azimuth, 30, 18))
    },
  }
}
