// 逆向运动学：给定肢体根部和末端要到的位置，算出两段骨头各自的朝向（腿够落脚点、手够球）。
import { Matrix4, Quaternion, Vector3 } from 'three'

export interface LimbPose {
  upper: Quaternion
  lower: Quaternion
  /** 中间关节（膝、肘）和末端（踝、腕）实际到达的位置。 */
  mid: Vector3
  end: Vector3
}

export function createLimbPose(): LimbPose {
  return { upper: new Quaternion(), lower: new Quaternion(), mid: new Vector3(), end: new Vector3() }
}

const along = new Vector3()
const side = new Vector3()
const upperDir = new Vector3()
const lowerDir = new Vector3()
const front = new Vector3()
const axisX = new Vector3()
const axisY = new Vector3()
const axisZ = new Vector3()
const basis = new Matrix4()

/**
 * 骨头的朝向：本地 -y 指向 down（骨头伸出的方向），本地 +z 尽量指向 forward。
 * 两个方向不需要互相垂直，forward 会被修正到与 down 垂直的平面上。
 */
export function aim(down: Vector3, forward: Vector3, out: Quaternion): Quaternion {
  axisY.copy(down)
  if (axisY.lengthSq() < 1e-10) axisY.set(0, -1, 0)
  axisY.normalize().negate()
  axisZ.copy(forward).addScaledVector(axisY, -forward.dot(axisY))
  if (axisZ.lengthSq() < 1e-8) axisZ.set(axisY.y, axisY.z, axisY.x).addScaledVector(axisY, -axisY.dot(axisZ))
  axisZ.normalize()
  axisX.crossVectors(axisY, axisZ)
  return out.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ))
}

/**
 * 双骨 IK。所有向量在同一个坐标系里（本项目用球员的本体坐标）。
 * @param pole 中间关节凸出的大致方向：膝盖朝前，肘尖朝后下方
 * @param kneeLike 为 true 时骨头的本地 +z 朝向关节凸出的一侧（腿）；为 false 时背向它（手臂的正面朝着肘窝一侧）
 */
export function solveLimb(origin: Vector3, target: Vector3, pole: Vector3, upperLength: number, lowerLength: number, kneeLike: boolean, out: LimbPose): void {
  along.subVectors(target, origin)
  const wanted = along.length()
  if (wanted < 1e-5) along.set(0, -1, 0)
  else along.divideScalar(wanted)
  // 够不着就伸直，离得太近就停在最弯的位置。
  const reach = Math.min((upperLength + lowerLength) * 0.999, Math.max(Math.abs(upperLength - lowerLength) + 0.01, wanted))
  side.copy(pole).addScaledVector(along, -pole.dot(along))
  if (side.lengthSq() < 1e-8) side.set(along.y, along.z, along.x).addScaledVector(along, -along.dot(side))
  side.normalize()
  const cosRoot = Math.min(1, Math.max(-1, (upperLength * upperLength + reach * reach - lowerLength * lowerLength) / (2 * upperLength * reach)))
  const sinRoot = Math.sqrt(1 - cosRoot * cosRoot)
  out.mid.copy(origin).addScaledVector(along, upperLength * cosRoot).addScaledVector(side, upperLength * sinRoot)
  out.end.copy(origin).addScaledVector(along, reach)
  upperDir.subVectors(out.mid, origin).normalize()
  lowerDir.subVectors(out.end, out.mid).normalize()
  // 弯曲平面内、垂直于骨头、指向关节凸出一侧的方向。
  front.copy(side).addScaledVector(upperDir, -side.dot(upperDir))
  if (!kneeLike) front.negate()
  aim(upperDir, front, out.upper)
  front.copy(side).addScaledVector(lowerDir, -side.dot(lowerDir))
  if (!kneeLike) front.negate()
  aim(lowerDir, front, out.lower)
}
