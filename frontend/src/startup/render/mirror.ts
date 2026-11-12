// 地面倒影：用一台关于地面对称的“镜像镜头”把室内再画一遍，结果供地面材质采样。
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from 'three'

const UP = new Vector3(0, 1, 0)

/** 镜面固定为 y = 0 的水平面，法线朝上。算法与 three.js 的 Reflector 相同，只是改为由管线显式调用。 */
export class PlanarMirror {
  /** 带逐级缩小版本的倒影图：越粗糙的地面采样越模糊的一级。 */
  readonly target: WebGLRenderTarget
  /** 世界坐标 → 倒影图坐标。 */
  readonly textureMatrix = new Matrix4()
  private readonly camera = new PerspectiveCamera()
  private readonly plane = new Plane()
  private readonly clip = new Vector4()
  private readonly corner = new Vector4()
  private readonly eye = new Vector3()
  private readonly lookAt = new Vector3()
  private readonly rotation = new Matrix4()

  /** samples 为倒影的多重采样数：细灯带在倒影里很亮，不抗锯齿会出现明显的台阶。 */
  constructor(samples: number) {
    this.target = new WebGLRenderTarget(4, 4, {
      type: HalfFloatType,
      samples,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(4, Math.round(width)), Math.max(4, Math.round(height)))
  }

  render(renderer: WebGLRenderer, scene: Scene, view: PerspectiveCamera): void {
    this.placeCamera(view)
    this.updateTextureMatrix()
    this.clipBelowFloor()
    renderer.setRenderTarget(this.target)
    renderer.render(scene, this.camera)
  }

  dispose(): void {
    this.target.dispose()
  }

  /** 把镜头位置和朝向都关于地面翻转。 */
  private placeCamera(view: PerspectiveCamera): void {
    view.getWorldPosition(this.eye)
    this.rotation.extractRotation(view.matrixWorld)
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.eye)
    this.camera.position.set(this.eye.x, -this.eye.y, this.eye.z)
    this.camera.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(UP)
    this.camera.lookAt(this.lookAt.x, -this.lookAt.y, this.lookAt.z)
    this.camera.near = view.near
    this.camera.far = view.far
    this.camera.updateMatrixWorld()
    this.camera.projectionMatrix.copy(view.projectionMatrix)
    this.camera.projectionMatrixInverse.copy(view.projectionMatrixInverse)
  }

  private updateTextureMatrix(): void {
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    this.textureMatrix.multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse)
  }

  /** 斜裁剪：把近裁剪面换成地面本身，地面以下的东西不会出现在倒影里。 */
  private clipBelowFloor(): void {
    this.plane.set(UP, 0).applyMatrix4(this.camera.matrixWorldInverse)
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant)
    const projection = this.camera.projectionMatrix.elements
    this.corner.set(
      (Math.sign(this.clip.x) + projection[8]) / projection[0],
      (Math.sign(this.clip.y) + projection[9]) / projection[5],
      -1,
      (1 + projection[10]) / projection[14],
    )
    this.clip.multiplyScalar(2 / this.clip.dot(this.corner))
    projection[2] = this.clip.x
    projection[6] = this.clip.y
    projection[10] = this.clip.z + 1 - 0.003
    projection[14] = this.clip.w
  }
}
