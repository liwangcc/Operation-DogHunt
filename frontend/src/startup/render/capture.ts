// 环境捕获：从房间中心向六个方向各拍一张，得到室外全景和室内环境反射。
import {
  CubeCamera,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  PMREMGenerator,
  WebGLCubeRenderTarget,
  type CubeTexture,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'

/** 拍摄点：房间中心、略高于战术桌。 */
const VANTAGE_HEIGHT = 2.6

function createCubeTarget(size: number): WebGLCubeRenderTarget {
  return new WebGLCubeRenderTarget(size, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  })
}

export class EnvironmentCapture {
  private readonly outdoorTarget: WebGLCubeRenderTarget
  private readonly interiorTarget: WebGLCubeRenderTarget
  private readonly pmrem: PMREMGenerator
  private filtered: { texture: Texture; dispose: () => void } | null = null

  constructor(private readonly renderer: WebGLRenderer, size: number) {
    this.outdoorTarget = createCubeTarget(size)
    this.interiorTarget = createCubeTarget(size)
    this.pmrem = new PMREMGenerator(renderer)
  }

  /** 室外全景：倒影和环境捕获里的窗户用它来显示城市。 */
  captureOutdoor(scene: Scene): CubeTexture {
    this.shoot(scene, this.outdoorTarget, 1, 2400)
    return this.outdoorTarget.texture
  }

  /**
   * 室内环境：返回原始全景（玻璃上的室内映像用）和按粗糙度预先模糊好的版本（物理材质的环境反射用）。
   * 重复调用会释放上一次的结果。
   */
  captureInterior(scene: Scene): { raw: CubeTexture; filtered: Texture } {
    this.shoot(scene, this.interiorTarget, 0.2, 60)
    this.filtered?.dispose()
    this.filtered = this.pmrem.fromCubemap(this.interiorTarget.texture)
    return { raw: this.interiorTarget.texture, filtered: this.filtered.texture }
  }

  dispose(): void {
    this.filtered?.dispose()
    this.pmrem.dispose()
    this.outdoorTarget.dispose()
    this.interiorTarget.dispose()
  }

  private shoot(scene: Scene, target: WebGLCubeRenderTarget, near: number, far: number): void {
    const camera = new CubeCamera(near, far, target)
    camera.position.set(0, VANTAGE_HEIGHT, 0)
    const previous = this.renderer.getRenderTarget()
    camera.update(this.renderer, scene)
    this.renderer.setRenderTarget(previous)
  }
}
