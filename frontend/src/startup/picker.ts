// 站点拾取：判断指针对准了场景里的哪个站点，以及站点在屏幕上的位置（用来摆放悬浮标签）。
import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import type { Station } from './scene/stations'

export class StationPicker {
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly toStation = new Vector3()
  private readonly projected = new Vector3()

  constructor(private readonly camera: PerspectiveCamera, private readonly stations: Station[]) {}

  /**
   * 指针位置用归一化坐标表示（左下 -1,-1，右上 1,1）。
   * 每个站点当作一个球，取视线最先碰到的那个；skip 用来排除当前已经停靠的站点。
   */
  pick(x: number, y: number, skip: Station['id'] | null = null): Station | null {
    this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera)
    const { origin, direction } = this.raycaster.ray
    let best: Station | null = null
    let bestEntry = Infinity
    for (const station of this.stations) {
      if (station.id === skip) continue
      this.toStation.subVectors(station.focus, origin)
      const along = this.toStation.dot(direction)
      if (along <= 0) continue
      const missSquared = this.toStation.lengthSq() - along * along
      const reachSquared = station.reach * station.reach
      if (missSquared > reachSquared) continue
      const entry = along - Math.sqrt(reachSquared - missSquared)
      if (entry < bestEntry) {
        bestEntry = entry
        best = station
      }
    }
    return best
  }

  /** 站点在画面上的位置（CSS 像素）；在镜头背后时返回 null。 */
  locate(station: Station, width: number, height: number): { x: number; y: number } | null {
    this.projected.copy(station.focus).project(this.camera)
    if (this.projected.z > 1) return null
    return { x: (this.projected.x * 0.5 + 0.5) * width, y: (0.5 - this.projected.y * 0.5) * height }
  }
}
