// 全屏着色通道：把一段片元着色器画满整个渲染目标，是泛光、调色等后期步骤的基础件。
import { ShaderMaterial, type IUniform, type WebGLRenderTarget, type WebGLRenderer } from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export class ScreenPass<Uniforms extends Record<string, IUniform>> {
  readonly uniforms: Uniforms
  private readonly material: ShaderMaterial
  private readonly quad: FullScreenQuad

  constructor(fragmentShader: string, uniforms: Uniforms) {
    this.uniforms = uniforms
    this.material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false })
    this.quad = new FullScreenQuad(this.material)
  }

  /** 画到指定目标；target 为 null 时直接画到屏幕。 */
  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target)
    this.quad.render(renderer)
  }

  dispose(): void {
    this.quad.dispose()
    this.material.dispose()
  }
}
