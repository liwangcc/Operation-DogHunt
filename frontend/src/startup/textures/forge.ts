// 贴图生成器：在显卡上把一段“表面配方”画成可平铺的细节贴图，不依赖任何外部图片。
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { NOISE_GLSL } from './noise'

export interface SurfaceRecipe {
  /**
   * 一段 GLSL，定义 `vec3 surface(vec2 uv)`：返回 (高度, 粗糙度, 明暗)，三者都在 0–1。
   * 高度决定凹凸，粗糙度 0.5 表示不改变材质本身的粗糙度，明暗 0.5 表示不改变底色。
   */
  body: string
  /** 把高度差换算成法线偏移的倍数，越大凹凸越明显。 */
  bump: number
  /** 贴图边长（像素）。 */
  size?: number
}

const forgeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** 输出格式：R、G 是法线的两个分量，B 是粗糙度变化，A 是明暗变化。 */
function forgeFragment(body: string): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uTexel;
    uniform float uBump;
    ${NOISE_GLSL}
    ${body}
    void main() {
      vec3 here = surface(vUv);
      float right = surface(vUv + vec2(uTexel, 0.0)).x;
      float above = surface(vUv + vec2(0.0, uTexel)).x;
      vec2 slope = clamp(vec2(here.x - right, here.x - above) * uBump, -1.0, 1.0);
      gl_FragColor = vec4(slope * 0.5 + 0.5, here.y, here.z);
    }
  `
}

export class TextureForge {
  private readonly targets: WebGLRenderTarget[] = []

  constructor(private readonly renderer: WebGLRenderer) {}

  /** 画出一张贴图并生成逐级缩小的版本，远看时不会闪烁。 */
  bake(recipe: SurfaceRecipe): Texture {
    const size = recipe.size ?? 1024
    const target = new WebGLRenderTarget(size, size, {
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      colorSpace: NoColorSpace,
    })
    target.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    const material = new ShaderMaterial({
      vertexShader: forgeVertex,
      fragmentShader: forgeFragment(recipe.body),
      uniforms: { uTexel: { value: 1 / size }, uBump: { value: recipe.bump } },
      depthTest: false,
      depthWrite: false,
    })
    const quad = new FullScreenQuad(material)
    const previous = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(target)
    quad.render(this.renderer)
    this.renderer.setRenderTarget(previous)
    quad.dispose()
    material.dispose()
    this.targets.push(target)
    return target.texture
  }

  dispose(): void {
    this.targets.forEach((target) => target.dispose())
    this.targets.length = 0
  }
}
