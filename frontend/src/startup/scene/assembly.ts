// 装配器：把零散的几何体按材质归并成少量网格，减少每帧的绘制次数。
import { Group, Mesh, type BufferGeometry, type Material, type Matrix4 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** 归并前统一成“只有位置和法线、不带索引”的格式；细节贴图按世界坐标投影，不需要贴图坐标。 */
function normalize(source: BufferGeometry, matrix?: Matrix4): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source
  if (geometry !== source) source.dispose()
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  if (matrix) geometry.applyMatrix4(matrix)
  return geometry
}

export class Assembly<Name extends string> {
  private readonly bins = new Map<Name, BufferGeometry[]>()

  /** 登记一个零件；matrix 是它在整体中的摆放位置。 */
  add(material: Name, geometry: BufferGeometry, matrix?: Matrix4): this {
    const bin = this.bins.get(material) ?? []
    bin.push(normalize(geometry, matrix))
    this.bins.set(material, bin)
    return this
  }

  /** 同一个零件按多个位置各放一份。 */
  addEach(material: Name, make: () => BufferGeometry, matrices: Matrix4[]): this {
    for (const matrix of matrices) this.add(material, make(), matrix)
    return this
  }

  /** 每种材质合成一个网格。 */
  build(materials: Record<Name, Material>, shadows = { cast: true, receive: true }): Group {
    const group = new Group()
    for (const [name, bin] of this.bins) {
      const merged = mergeGeometries(bin)
      bin.forEach((geometry) => geometry.dispose())
      if (!merged) continue
      const mesh = new Mesh(merged, materials[name])
      mesh.name = name
      mesh.castShadow = shadows.cast
      mesh.receiveShadow = shadows.receive
      group.add(mesh)
    }
    this.bins.clear()
    return group
  }
}
