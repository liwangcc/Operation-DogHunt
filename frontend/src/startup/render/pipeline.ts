// 渲染管线：规定每一帧先画什么、后画什么，并管理中间用到的各个渲染目标。
import {
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  UnsignedIntType,
  WebGLRenderTarget,
  type CubeTexture,
  type Matrix4,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { Bloom } from './bloom'
import { EnvironmentCapture } from './capture'
import { Grade } from './grade'
import { PlanarMirror } from './mirror'
import { AmbientOcclusion } from './occlusion'

/** 画质开关，由 quality.ts 的档位决定。 */
export interface PipelineSettings {
  /** 主画面的多重采样数（抗锯齿）。 */
  samples: number
  /** 泛光层数。 */
  bloomLevels: number
  /** 地面倒影相对主画面的分辨率比例；0 表示关闭。 */
  mirrorScale: number
  /** 环境全景的边长。 */
  environmentSize: number
  /** 是否计算环境光遮蔽。 */
  occlusion: boolean
}

/** 场景需要向管线提供的内容，以及管线回填给材质的每帧输入。 */
export interface RenderWorld {
  interior: Scene
  outdoor: Scene
  /** 主画面：窗户从这张“室外画面”里取景。 */
  setBackdrop: (texture: Texture) => void
  /** 倒影与环境捕获时，窗户改从室外全景取景。 */
  setPanoramaMode: (enabled: boolean) => void
  setPanoramas: (outdoor: CubeTexture, interior: CubeTexture | null) => void
  setMirror: (texture: Texture | null, matrix: Matrix4) => void
  /** 倒影里不需要再画地面自己。 */
  setFloorVisible: (visible: boolean) => void
}

/** 只有一个场景、不需要室外画面的轻量绘制对象（比赛画面）。 */
export interface LiteView {
  scene: Scene
  camera: PerspectiveCamera
  setMirror: (texture: Texture | null, matrix: Matrix4) => void
  setFloorVisible: (visible: boolean) => void
}

export class Pipeline {
  readonly grade = new Grade()
  private readonly sceneTarget: WebGLRenderTarget
  private readonly outdoorTarget: WebGLRenderTarget
  private readonly mirror: PlanarMirror
  private readonly bloom: Bloom
  private readonly capture: EnvironmentCapture
  private occlusion: AmbientOcclusion | null
  private mirrorScale: number
  private width = 1
  private height = 1

  constructor(private readonly renderer: WebGLRenderer, settings: PipelineSettings) {
    this.sceneTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: settings.samples,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    })
    this.outdoorTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
    this.mirror = new PlanarMirror(settings.samples)
    this.bloom = new Bloom(settings.bloomLevels)
    this.capture = new EnvironmentCapture(renderer, settings.environmentSize)
    this.occlusion = settings.occlusion ? new AmbientOcclusion() : null
    this.mirrorScale = settings.mirrorScale
  }

  /** 按绘图缓冲区的像素尺寸调整所有渲染目标。 */
  setSize(width: number, height: number): void {
    this.width = Math.max(2, Math.round(width))
    this.height = Math.max(2, Math.round(height))
    this.sceneTarget.setSize(this.width, this.height)
    this.outdoorTarget.setSize(this.width, this.height)
    this.bloom.setSize(this.width, this.height)
    this.occlusion?.setSize(this.width, this.height)
    this.grade.pass.uniforms.uResolution.value.set(this.width, this.height)
    this.resizeMirror()
  }

  /** 运行中关闭环境光遮蔽（画质降档用）。 */
  disableOcclusion(): boolean {
    if (!this.occlusion) return false
    this.occlusion.dispose()
    this.occlusion = null
    return true
  }

  /** 运行中关闭或调低倒影（画质降档用）。 */
  setMirrorScale(scale: number): void {
    this.mirrorScale = scale
    this.resizeMirror()
  }

  /**
   * 拍摄环境全景并交给场景：先拍室外，再拍室内（此时窗户已能显示室外全景）。
   * 场景搭好、灯都点亮之后调用一次；返回预先模糊好的室内环境，供物理材质做反射。
   */
  captureEnvironment(world: RenderWorld): Texture {
    const outdoor = this.capture.captureOutdoor(world.outdoor)
    world.setPanoramas(outdoor, null)
    world.setPanoramaMode(true)
    world.setMirror(null, this.mirror.textureMatrix)
    const interior = this.capture.captureInterior(world.interior)
    world.setPanoramas(outdoor, interior.raw)
    world.setPanoramaMode(false)
    return interior.filtered
  }

  render(world: RenderWorld, camera: PerspectiveCamera, time: number): void {
    const renderer = this.renderer
    renderer.setRenderTarget(this.outdoorTarget)
    renderer.render(world.outdoor, camera)

    if (this.mirrorScale > 0) {
      world.setPanoramaMode(true)
      world.setFloorVisible(false)
      this.mirror.render(renderer, world.interior, camera)
      world.setFloorVisible(true)
      world.setPanoramaMode(false)
      world.setMirror(this.mirror.target.texture, this.mirror.textureMatrix)
    } else {
      world.setMirror(null, this.mirror.textureMatrix)
    }

    world.setBackdrop(this.outdoorTarget.texture)
    renderer.setRenderTarget(this.sceneTarget)
    renderer.render(world.interior, camera)
    this.present(camera, time)
  }

  /** 轻量绘制：地面倒影 → 主画面 → 后期。比启动页少画室外和环境捕获，用于比赛。 */
  renderLite(view: LiteView, time: number): void {
    const renderer = this.renderer
    if (this.mirrorScale > 0) {
      view.setFloorVisible(false)
      this.mirror.render(renderer, view.scene, view.camera)
      view.setFloorVisible(true)
      view.setMirror(this.mirror.target.texture, this.mirror.textureMatrix)
    } else {
      view.setMirror(null, this.mirror.textureMatrix)
    }
    renderer.setRenderTarget(this.sceneTarget)
    renderer.render(view.scene, view.camera)
    this.present(view.camera, time)
  }

  /** 后期：遮蔽、泛光、调色，画到屏幕上。 */
  private present(camera: PerspectiveCamera, time: number): void {
    const renderer = this.renderer
    const glow = this.bloom.render(renderer, this.sceneTarget.texture, this.width, this.height)
    const uniforms = this.grade.pass.uniforms
    uniforms.tScene.value = this.sceneTarget.texture
    uniforms.tBloom.value = glow
    const depth = this.sceneTarget.depthTexture
    uniforms.tOcclusion.value = this.occlusion && depth ? this.occlusion.render(renderer, depth, camera) : null
    uniforms.uOcclusion.value = this.occlusion ? 1 : 0
    uniforms.uTime.value = time
    this.grade.pass.render(renderer, null)
  }

  dispose(): void {
    this.sceneTarget.depthTexture?.dispose()
    this.sceneTarget.dispose()
    this.outdoorTarget.dispose()
    this.mirror.dispose()
    this.bloom.dispose()
    this.capture.dispose()
    this.occlusion?.dispose()
    this.grade.dispose()
  }

  private resizeMirror(): void {
    if (this.mirrorScale > 0) this.mirror.setSize(this.width * this.mirrorScale, this.height * this.mirrorScale)
  }
}
