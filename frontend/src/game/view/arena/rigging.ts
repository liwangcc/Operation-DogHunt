// 球馆顶部：中央吊挂的四面记分屏（显示实时比分和时间）、灯架，以及球场上方成排的照明灯。
import { BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry } from 'three'
import type { MaterialKit } from '@/startup/materials/kit'
import { TEAM_NAMES } from '../../hud'
import { TEAM_COLORS } from '../athlete/model'

const SCREEN = { width: 512, height: 288 }

export interface ScoreLine {
  score: [number, number]
  /** 本节剩余的整秒数，以及第几节（加时为 0）。 */
  clock: number
  period: number
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function paint(ctx: CanvasRenderingContext2D, line: ScoreLine): void {
  const { width, height } = SCREEN
  ctx.fillStyle = '#04080d'
  ctx.fillRect(0, 0, width, height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const team of [0, 1]) {
    const x = team === 0 ? width * 0.2 : width * 0.8
    ctx.fillStyle = css(TEAM_COLORS[team])
    ctx.fillRect(x - 78, 22, 156, 8)
    ctx.font = '700 38px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.fillText(TEAM_NAMES[team], x, 66)
    ctx.fillStyle = '#f4fbff'
    ctx.font = '800 132px "Arial Narrow", Arial, sans-serif'
    ctx.fillText(String(line.score[team]), x, 180)
  }
  const minutes = Math.floor(line.clock / 60)
  const seconds = String(line.clock % 60).padStart(2, '0')
  ctx.fillStyle = '#ffd27a'
  ctx.font = '700 62px "Arial Narrow", Arial, sans-serif'
  ctx.fillText(`${minutes}:${seconds}`, width / 2, 150)
  ctx.fillStyle = '#9fb4c2'
  ctx.font = '600 26px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillText(line.period > 0 ? `第 ${line.period} 节` : '加时', width / 2, 84)
}

export interface Rigging {
  object: Group
  /** 中央记分屏和灯架：开场从正上方俯视时要藏起来，免得挡住球场。 */
  hanging: Group
  setScore: (line: ScoreLine) => void
  dispose: () => void
}

export function createRigging(kit: MaterialKit): Rigging {
  const object = new Group()
  const hanging = new Group()
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // 屏幕自己发光：亮度乘到 1 以上，会带一点泛光。
  const screenMaterial = new MeshBasicMaterial({ map: texture, color: new Color(1.5, 1.5, 1.5) })
  const core = new Mesh(new BoxGeometry(4.4, 2.6, 4.4), kit.materials.blackMetal)
  core.position.y = 12.3
  hanging.add(core)
  for (let i = 0; i < 4; i += 1) {
    const angle = (i * Math.PI) / 2
    const screen = new Mesh(new PlaneGeometry(4.1, 2.3), screenMaterial)
    screen.position.set(Math.sin(angle) * 2.22, 12.3, Math.cos(angle) * 2.22)
    screen.rotation.y = angle
    hanging.add(screen)
  }
  for (const y of [10.9, 13.7]) {
    const ring = new Mesh(new BoxGeometry(4.7, 0.16, 4.7), kit.materials.ledTealDim)
    ring.position.y = y
    hanging.add(ring)
  }
  const truss = new Mesh(new TorusGeometry(7.5, 0.12, 8, 48).rotateX(Math.PI / 2), kit.materials.gunmetal)
  truss.position.y = 14.4
  hanging.add(truss)
  const cable = new Mesh(new CylinderGeometry(0.05, 0.05, 6, 6), kit.materials.gunmetal)
  cable.position.y = 16.6
  hanging.add(cable)

  // 照明灯：球场上方四排，每排十四盏；灯面很亮，会映在地板的清漆上。
  const lampGlow = new MeshBasicMaterial({ color: new Color(1, 0.96, 0.9).multiplyScalar(3.2) })
  const lamps = new InstancedMesh(new BoxGeometry(0.9, 0.1, 0.5), lampGlow, 56)
  const housings = new InstancedMesh(new BoxGeometry(1.05, 0.22, 0.65), kit.materials.blackMetal, 56)
  let index = 0
  for (const z of [-9.5, -3.4, 3.4, 9.5]) {
    for (let i = 0; i < 14; i += 1) {
      const x = (i - 6.5) * 2.5
      lamps.setMatrixAt(index, new Matrix4().makeTranslation(x, 15.3, z))
      housings.setMatrixAt(index, new Matrix4().makeTranslation(x, 15.45, z))
      index += 1
    }
  }
  for (const z of [-9.5, -3.4, 3.4, 9.5]) {
    const rail = new Mesh(new BoxGeometry(36, 0.14, 0.14), kit.materials.gunmetal)
    rail.position.set(0, 15.7, z)
    object.add(rail)
  }
  object.add(hanging, lamps, housings)
  let shown = ''
  return {
    object,
    hanging,
    setScore: (line) => {
      const key = `${line.score[0]}:${line.score[1]}:${line.clock}:${line.period}`
      if (key === shown || !context) return
      shown = key
      paint(context, line)
      texture.needsUpdate = true
    },
    dispose: () => {
      texture.dispose()
      screenMaterial.dispose()
      lampGlow.dispose()
      object.traverse((node) => (node as Mesh).geometry?.dispose())
    },
  }
}
