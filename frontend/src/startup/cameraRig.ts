// 镜头规则：围绕战术桌观察的边界、不同屏幕比例下的初始机位，以及在各个机位之间平滑移动的过渡。
import { MathUtils, Spherical, Vector3, type PerspectiveCamera } from 'three'

const radians = MathUtils.degToRad

/**
 * 自由观察时，镜头始终看向桌面上方一点，并被限制在房间内：
 * 最远 8 米时仍在沙发、机柜等高大物体之前，最高处离顶部还有约 2 米，
 * 最近 5 米时仍在桌子和全息投影之外。镜头最低约 1.87 米，高于座椅、显示器等所有低矮家具。
 * 尺寸来源见 scene/layout.ts 的 room。
 */
export const orbitLimits = {
  target: new Vector3(0, 1.7, 0),
  minDistance: 5,
  maxDistance: 8,
  minPolar: radians(52),
  maxPolar: radians(88),
} as const

const LANDSCAPE_FOV = 55
const PORTRAIT_BELOW = 0.85

/** 一个机位：镜头在哪、看向哪。 */
export interface Pose {
  position: Vector3
  target: Vector3
}

export interface Lens {
  /** 竖直视角（度）。 */
  fov: number
  /** 初始机位，也是“重置视角”的目的地。 */
  home: Spherical
}

/** 按画面宽高比决定视角与初始机位；竖屏改为顺着球场长边看，让整张桌子都能入画。 */
export function lensFor(aspect: number): Lens {
  if (aspect < PORTRAIT_BELOW) {
    const fov = MathUtils.clamp(MathUtils.radToDeg(2 * Math.atan(Math.tan(radians(23)) / aspect)), LANDSCAPE_FOV, 82)
    return { fov, home: new Spherical(orbitLimits.maxDistance, radians(70), Math.PI / 2) }
  }
  // 接近方形的窗口适当加大竖直视角，保证水平方向不比 1:1 时更窄。
  const fov = aspect >= 1 ? LANDSCAPE_FOV : MathUtils.radToDeg(2 * Math.atan(Math.tan(radians(LANDSCAPE_FOV / 2)) / aspect))
  return { fov, home: new Spherical(7.6, radians(76), 0) }
}

/** 环绕战术桌的机位：给出相对桌子的方位、俯仰和距离。 */
export function orbitPose(orbit: Spherical): Pose {
  return { position: new Vector3().setFromSpherical(orbit).add(orbitLimits.target), target: orbitLimits.target.clone() }
}

export function applyPose(camera: PerspectiveCamera, pose: Pose): void {
  camera.position.copy(pose.position)
  camera.lookAt(pose.target)
}

export function readOrbit(camera: PerspectiveCamera): Spherical {
  return new Spherical().setFromVector3(camera.position.clone().sub(orbitLimits.target))
}

/** 离某个位置最近的合法环绕机位：保持方位不变，把距离和俯仰收进边界内。 */
export function nearestOrbit(position: Vector3): Spherical {
  const orbit = new Spherical().setFromVector3(position.clone().sub(orbitLimits.target))
  orbit.radius = MathUtils.clamp(orbit.radius, 6.4, orbitLimits.maxDistance - 0.4)
  orbit.phi = MathUtils.clamp(orbit.phi, radians(68), radians(80))
  return orbit
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * 从一个机位到另一个机位的平滑移动。
 * 镜头位置按“绕房间中轴的方位、离中轴的距离、高度”三个量分别过渡，所以路线是一段绕着战术桌的弧线，
 * 不会从桌子上方直穿过去；水平方向走较短的一侧。
 */
export class CameraTween {
  private readonly fromTarget = new Vector3()
  private readonly toTarget = new Vector3()
  private from = { angle: 0, radius: 0, height: 0 }
  private to = { angle: 0, radius: 0, height: 0 }
  private startedAt = 0
  private duration = 0
  private finish: (() => void) | null = null
  active = false

  begin(from: Pose, to: Pose, durationMs: number, now: number, finish?: () => void): void {
    this.from = this.cylindrical(from.position)
    this.to = this.cylindrical(to.position)
    this.to.angle = this.from.angle + MathUtils.euclideanModulo(this.to.angle - this.from.angle + Math.PI, Math.PI * 2) - Math.PI
    this.fromTarget.copy(from.target)
    this.toTarget.copy(to.target)
    this.startedAt = now
    this.duration = durationMs
    this.finish = finish ?? null
    this.active = true
  }

  /** 推进到 now 时刻并返回当前看向的点；到达终点时触发回调。没有进行中的过渡时返回 null。 */
  step(camera: PerspectiveCamera, now: number): Vector3 | null {
    if (!this.active) return null
    const progress = this.duration > 0 ? Math.min(1, (now - this.startedAt) / this.duration) : 1
    const eased = easeInOut(progress)
    const angle = MathUtils.lerp(this.from.angle, this.to.angle, eased)
    const radius = MathUtils.lerp(this.from.radius, this.to.radius, eased)
    camera.position.set(Math.sin(angle) * radius, MathUtils.lerp(this.from.height, this.to.height, eased), Math.cos(angle) * radius)
    const target = new Vector3().lerpVectors(this.fromTarget, this.toTarget, eased)
    camera.lookAt(target)
    if (progress >= 1) this.complete()
    return target
  }

  /** 中止过渡并通知等待方，镜头停在当前位置。 */
  cancel(): void {
    if (this.active) this.complete()
  }

  private complete(): void {
    this.active = false
    const finish = this.finish
    this.finish = null
    finish?.()
  }

  private cylindrical(position: Vector3): { angle: number; radius: number; height: number } {
    return { angle: Math.atan2(position.x, position.z), radius: Math.hypot(position.x, position.z), height: position.y }
  }
}
