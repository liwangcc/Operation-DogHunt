// 泛光：提取画面中超过阈值的高亮，逐级缩小模糊再逐级放大叠回，得到柔和的光晕。
import { HalfFloatType, LinearFilter, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three'
import { ScreenPass } from './fullscreen'

// 软阈值：亮度刚过阈值的部分平滑过渡，避免光晕边缘生硬；同时限制极端亮度，防止个别像素闪成一片。
const prefilterFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;
  vec3 pick(vec2 uv) {
    vec3 color = min(texture2D(tSource, uv).rgb, vec3(24.0));
    float brightness = max(color.r, max(color.g, color.b));
    // 任何着色器算出的非数都在这里拦下，否则会沿着缩放链扩散到整个画面。
    if (!(brightness >= 0.0 && brightness <= 24.0)) return vec3(0.0);
    float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    return color * max(soft, brightness - uThreshold) / max(brightness, 1e-4);
  }
  void main() {
    vec3 sum = pick(vUv + uTexel * vec2(-1.0, -1.0)) + pick(vUv + uTexel * vec2(1.0, -1.0))
             + pick(vUv + uTexel * vec2(-1.0, 1.0)) + pick(vUv + uTexel * vec2(1.0, 1.0));
    gl_FragColor = vec4(sum * 0.25, 1.0);
  }
`

// 13 点采样的缩小：比简单取平均更稳定，移动镜头时光晕不会闪烁。
const downFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tSource, vUv + t * vec2(-2.0, 2.0)).rgb;
    vec3 b = texture2D(tSource, vUv + t * vec2(0.0, 2.0)).rgb;
    vec3 c = texture2D(tSource, vUv + t * vec2(2.0, 2.0)).rgb;
    vec3 d = texture2D(tSource, vUv + t * vec2(-2.0, 0.0)).rgb;
    vec3 e = texture2D(tSource, vUv).rgb;
    vec3 f = texture2D(tSource, vUv + t * vec2(2.0, 0.0)).rgb;
    vec3 g = texture2D(tSource, vUv + t * vec2(-2.0, -2.0)).rgb;
    vec3 h = texture2D(tSource, vUv + t * vec2(0.0, -2.0)).rgb;
    vec3 i = texture2D(tSource, vUv + t * vec2(2.0, -2.0)).rgb;
    vec3 j = texture2D(tSource, vUv + t * vec2(-1.0, 1.0)).rgb;
    vec3 k = texture2D(tSource, vUv + t * vec2(1.0, 1.0)).rgb;
    vec3 l = texture2D(tSource, vUv + t * vec2(-1.0, -1.0)).rgb;
    vec3 m = texture2D(tSource, vUv + t * vec2(1.0, -1.0)).rgb;
    vec3 color = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    gl_FragColor = vec4(color, 1.0);
  }
`

// 放大时用 3×3 的帐篷形权重，并叠加上一级保留的细节。
const upFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tLow;
  uniform sampler2D tHigh;
  uniform vec2 uTexel;
  uniform float uSpread;
  void main() {
    vec2 t = uTexel * uSpread;
    vec3 blur = texture2D(tLow, vUv).rgb * 4.0;
    blur += (texture2D(tLow, vUv + vec2(t.x, 0.0)).rgb + texture2D(tLow, vUv - vec2(t.x, 0.0)).rgb
           + texture2D(tLow, vUv + vec2(0.0, t.y)).rgb + texture2D(tLow, vUv - vec2(0.0, t.y)).rgb) * 2.0;
    blur += texture2D(tLow, vUv + t).rgb + texture2D(tLow, vUv - t).rgb
          + texture2D(tLow, vUv + vec2(t.x, -t.y)).rgb + texture2D(tLow, vUv + vec2(-t.x, t.y)).rgb;
    gl_FragColor = vec4(blur / 16.0 + texture2D(tHigh, vUv).rgb, 1.0);
  }
`

function createTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })
}

export class Bloom {
  private readonly downs: WebGLRenderTarget[]
  private readonly ups: WebGLRenderTarget[]
  private readonly prefilter = new ScreenPass(prefilterFragment, {
    tSource: { value: null as Texture | null },
    uTexel: { value: new Vector2() },
    uThreshold: { value: 1 },
    uKnee: { value: 0.5 },
  })
  private readonly down = new ScreenPass(downFragment, { tSource: { value: null as Texture | null }, uTexel: { value: new Vector2() } })
  private readonly up = new ScreenPass(upFragment, {
    tLow: { value: null as Texture | null },
    tHigh: { value: null as Texture | null },
    uTexel: { value: new Vector2() },
    uSpread: { value: 1 },
  })

  /** levels 越多光晕越宽，但开销也越大。 */
  constructor(private readonly levels: number) {
    this.downs = Array.from({ length: levels }, createTarget)
    this.ups = Array.from({ length: levels - 1 }, createTarget)
  }

  setSize(width: number, height: number): void {
    for (let i = 0; i < this.levels; i += 1) {
      const w = Math.max(2, Math.round(width / 2 ** (i + 1)))
      const h = Math.max(2, Math.round(height / 2 ** (i + 1)))
      this.downs[i].setSize(w, h)
      if (i < this.levels - 1) this.ups[i].setSize(w, h)
    }
  }

  /** 返回只含光晕的贴图（已按层数归一），由调色通道叠加到画面上。 */
  render(renderer: WebGLRenderer, source: Texture, sourceWidth: number, sourceHeight: number): Texture {
    this.prefilter.uniforms.tSource.value = source
    this.prefilter.uniforms.uTexel.value.set(1 / sourceWidth, 1 / sourceHeight)
    this.prefilter.render(renderer, this.downs[0])
    for (let i = 1; i < this.levels; i += 1) {
      const from = this.downs[i - 1]
      this.down.uniforms.tSource.value = from.texture
      this.down.uniforms.uTexel.value.set(1 / from.width, 1 / from.height)
      this.down.render(renderer, this.downs[i])
    }
    let low = this.downs[this.levels - 1]
    for (let i = this.levels - 2; i >= 0; i -= 1) {
      this.up.uniforms.tLow.value = low.texture
      this.up.uniforms.tHigh.value = this.downs[i].texture
      this.up.uniforms.uTexel.value.set(1 / low.width, 1 / low.height)
      this.up.render(renderer, this.ups[i])
      low = this.ups[i]
    }
    return low.texture
  }

  get normalization(): number {
    return 1 / this.levels
  }

  dispose(): void {
    ;[...this.downs, ...this.ups].forEach((target) => target.dispose())
    this.prefilter.dispose()
    this.down.dispose()
    this.up.dispose()
  }
}
