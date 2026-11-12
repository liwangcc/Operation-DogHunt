// 球馆的环境反射：用几块发光面代表顶灯、LED 围挡、看台和地板，生成物理材质用的环境贴图。
// 不直接拍整个球馆，是因为那样要把所有模型多画六遍，进入比赛前会卡住。
import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator, PlaneGeometry, Scene, type Texture, type WebGLRenderer } from 'three'
import { palette } from '@/startup/scene/layout'
import { COURT } from '../sim/constants'

export interface ArenaEnvironment {
  texture: Texture
  dispose: () => void
}

function glow(color: Color | number, intensity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) })
}

export function createArenaEnvironment(renderer: WebGLRenderer): ArenaEnvironment {
  const scene = new Scene()
  const add = (mesh: Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z)
    scene.add(mesh)
  }
  // 远处一片昏暗的看台，把整个球馆包起来。
  add(new Mesh(new BoxGeometry(90, 40, 70), new MeshBasicMaterial({ color: 0x0a0f17, side: BackSide })), 0, 14, 0)
  // 被灯照亮的木地板：从下方给球员一点暖色的反光。
  add(new Mesh(new PlaneGeometry(COURT.halfLength * 2, COURT.halfWidth * 2).rotateX(-Math.PI / 2), glow(0x8a6238, 0.7)), 0, 0, 0)
  // 顶上的灯阵：一大片柔和的顶光，加上几排明亮的灯。
  add(new Mesh(new PlaneGeometry(34, 20).rotateX(Math.PI / 2), glow(0xdfe9ff, 0.5)), 0, 16, 0)
  for (const x of [-10, 0, 10]) for (const z of [-5, 5]) add(new Mesh(new PlaneGeometry(5, 1.6).rotateX(Math.PI / 2), glow(0xfff4e2, 7)), x, 15.5, z)
  // 两条边线外的 LED 围挡。
  for (const side of [1, -1]) {
    add(new Mesh(new PlaneGeometry(COURT.halfLength * 2, 0.9).rotateY(side > 0 ? Math.PI : 0), glow(palette.glow, 1.6)), -6, 0.5, side * (COURT.halfWidth + 2.6))
    add(new Mesh(new PlaneGeometry(COURT.halfLength * 2, 0.9).rotateY(side > 0 ? Math.PI : 0), glow(palette.warm, 1.6)), 6, 0.5, side * (COURT.halfWidth + 2.7))
  }
  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromScene(scene, 0.03, 0.5, 120)
  pmrem.dispose()
  scene.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    ;(mesh.material as MeshBasicMaterial).dispose()
  })
  return { texture: target.texture, dispose: () => target.dispose() }
}
