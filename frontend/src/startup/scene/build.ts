// 几何小工具：绕竖轴旋转出带硬棱的环形构件、按轮廓逐层拉伸、倒角盒，以及常用的摆放变换。
import { BufferGeometry, Float32BufferAttribute, Matrix4, ShapeUtils, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** 剖面上的一个点：[半径, 高度]。 */
export type ProfilePoint = [number, number]
/** 俯视轮廓上的一圈点：[x, z]，围绕原点排列。 */
export type Outline = Array<[number, number]>

export interface RevolveOptions {
  /** 起止方位角（弧度）；省略时转满一圈。 */
  from?: number
  to?: number
  /** 沿圆周的分段数。 */
  segments?: number
  /** 剖面首尾是否相连（实心构件为 true）。 */
  closed?: boolean
  /** 只转一段弧时，是否把两端封上。 */
  caps?: boolean
}

function writeTriangle(out: number[], a: Vector3, b: Vector3, c: Vector3): void {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
}

function ringPoint(radius: number, height: number, angle: number): Vector3 {
  return new Vector3(Math.cos(angle) * radius, height, -Math.sin(angle) * radius)
}

/** 把剖面多边形放到指定方位的竖直面上，封住弧形构件的端头。 */
function writeCap(positions: number[], normals: number[], profile: ProfilePoint[], angle: number, facing: number): void {
  const contour = profile.map(([r, y]) => new Vector2(r, y))
  const faces = ShapeUtils.triangulateShape(contour, [])
  // (sin, 0, cos) 指向方位角减小的一侧，也就是起始端头朝外的方向。
  const normal = new Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(facing)
  for (const [i, j, k] of faces) {
    const corners = [i, j, k].map((index) => ringPoint(profile[index][0], profile[index][1], angle))
    const winding = new Vector3().subVectors(corners[1], corners[0]).cross(new Vector3().subVectors(corners[2], corners[0]))
    if (winding.dot(normal) < 0) corners.reverse()
    writeTriangle(positions, corners[0], corners[1], corners[2])
    for (let n = 0; n < 3; n += 1) normals.push(normal.x, normal.y, normal.z)
  }
}

/**
 * 把一条剖面线绕竖轴旋转成环形构件。
 * 剖面按逆时针给出（半径向右、高度向上）时，表面朝外；每段剖面单独成面，所以剖面的拐角是硬棱，
 * 而沿圆周方向保持平滑。给剖面多加一小段斜边，就得到能勾出高光的倒角。
 */
export function revolve(profile: ProfilePoint[], options: RevolveOptions = {}): BufferGeometry {
  const from = options.from ?? 0
  const to = options.to ?? from + Math.PI * 2
  const fullCircle = Math.abs(to - from) >= Math.PI * 2 - 1e-6
  const segments = options.segments ?? Math.max(8, Math.ceil(Math.abs(to - from) / (Math.PI / 48)))
  const positions: number[] = []
  const normals: number[] = []
  const count = options.closed ? profile.length : profile.length - 1

  for (let p = 0; p < count; p += 1) {
    const [r0, y0] = profile[p]
    const [r1, y1] = profile[(p + 1) % profile.length]
    const length = Math.hypot(r1 - r0, y1 - y0)
    if (length < 1e-7) continue
    const normalR = (y1 - y0) / length
    const normalY = -(r1 - r0) / length
    for (let s = 0; s < segments; s += 1) {
      const a0 = from + ((to - from) * s) / segments
      const a1 = from + ((to - from) * (s + 1)) / segments
      const corners = [ringPoint(r0, y0, a0), ringPoint(r1, y1, a0), ringPoint(r1, y1, a1), ringPoint(r0, y0, a1)]
      const cornerNormals = [a0, a0, a1, a1].map((angle) => ringPoint(normalR, normalY, angle))
      const faceNormal = new Vector3().subVectors(corners[1], corners[0]).cross(new Vector3().subVectors(corners[3], corners[0]))
      // 让三角形的绕向与法线一致，否则背面剔除会把它吃掉。
      const order = faceNormal.dot(cornerNormals[0]) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
      for (const index of order) {
        positions.push(corners[index].x, corners[index].y, corners[index].z)
        normals.push(cornerNormals[index].x, cornerNormals[index].y, cornerNormals[index].z)
      }
    }
  }
  if (options.closed && !fullCircle && options.caps !== false) {
    writeCap(positions, normals, profile, from, to > from ? 1 : -1)
    writeCap(positions, normals, profile, to, to > from ? -1 : 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return geometry
}

/** 矩形剖面的环形构件，四条棱带倒角：内外半径、上下高度。 */
export function ringBlock(inner: number, outer: number, bottom: number, top: number, bevel = 0.012, options: RevolveOptions = {}): BufferGeometry {
  const b = Math.min(bevel, (outer - inner) / 2.2, (top - bottom) / 2.2)
  const profile: ProfilePoint[] = [
    [inner + b, bottom], [outer - b, bottom], [outer, bottom + b], [outer, top - b],
    [outer - b, top], [inner + b, top], [inner, top - b], [inner, bottom + b],
  ]
  return revolve(profile, { closed: true, ...options })
}

/**
 * 按“内收量 + 高度”的剖面，把一圈俯视轮廓逐层拉伸成棱柱体（例如八边形桌身）。
 * outlineAt(inset) 返回向内收 inset 米后的轮廓；相邻两层之间是平面，所以每条棱都是硬的。
 */
export function loftOutline(outlineAt: (inset: number) => Outline, profile: Array<[number, number]>, capTop = true, capBottom = false): BufferGeometry {
  const positions: number[] = []
  const emit = (a: Vector3, b: Vector3, c: Vector3, facing: Vector3): void => {
    const winding = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
    if (winding.dot(facing) >= 0) writeTriangle(positions, a, b, c)
    else writeTriangle(positions, a, c, b)
  }
  for (let layer = 0; layer < profile.length - 1; layer += 1) {
    const lower = outlineAt(profile[layer][0])
    const upper = outlineAt(profile[layer + 1][0])
    const y0 = profile[layer][1]
    const y1 = profile[layer + 1][1]
    lower.forEach(([x, z], i) => {
      const j = (i + 1) % lower.length
      const b0 = new Vector3(x, y0, z)
      const b1 = new Vector3(lower[j][0], y0, lower[j][1])
      const t0 = new Vector3(upper[i][0], y1, upper[i][1])
      const t1 = new Vector3(upper[j][0], y1, upper[j][1])
      // 侧壁大致朝外；上下层内收量不同时带一点仰俯。
      const facing = new Vector3(b0.x + b1.x, (profile[layer][0] - profile[layer + 1][0]) * -4, b0.z + b1.z)
      if (Math.abs(y1 - y0) < 1e-6) facing.set(0, profile[layer + 1][0] > profile[layer][0] ? 1 : -1, 0)
      emit(b0, b1, t1, facing)
      emit(b0, t1, t0, facing)
    })
  }
  const cap = (index: number, up: boolean): void => {
    const ring = outlineAt(profile[index][0])
    const y = profile[index][1]
    const center = new Vector3(0, y, 0)
    const facing = new Vector3(0, up ? 1 : -1, 0)
    ring.forEach(([x, z], i) => {
      const [nx, nz] = ring[(i + 1) % ring.length]
      emit(center, new Vector3(x, y, z), new Vector3(nx, y, nz), facing)
    })
  }
  if (capTop) cap(profile.length - 1, true)
  if (capBottom) cap(0, false)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** 带圆角的方盒：真实物体没有绝对锐利的棱，圆角能接住高光。 */
export function rbox(width: number, height: number, depth: number, radius = 0.012, segments = 2): BufferGeometry {
  const limit = Math.min(width, height, depth) / 2.01
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, limit))
}

/** 平移后的几何体（原地修改并返回，便于链式书写）。 */
export function moved(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.translate(x, y, z)
}

/** 依次应用若干变换矩阵。 */
export function transformed(geometry: BufferGeometry, ...matrices: Matrix4[]): BufferGeometry {
  for (const matrix of matrices) geometry.applyMatrix4(matrix)
  return geometry
}
