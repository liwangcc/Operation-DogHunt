// 环境光遮蔽：根据深度图估算每个像素周围被遮挡的程度，让墙角、家具底部和缝隙里自然变暗。
import { LinearFilter, RedFormat, UnsignedByteType, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three'
import { ScreenPass } from './fullscreen'

// 深度 → 镜头空间位置的换算，采样和模糊两个着色器共用。
const depthGlsl = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uLens;
  uniform float uNear;
  uniform float uFar;
  float viewDepth(vec2 uv) {
    float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - ndc * (uFar - uNear));
  }
  vec3 viewPosition(vec2 uv) {
    float depth = viewDepth(uv);
    return vec3((uv * 2.0 - 1.0) * uLens * depth, -depth);
  }
`

// 在像素周围按螺旋线取若干个点：如果邻近的表面“高出”当前表面，就说明这里被挡住了一部分环境光。
// 采样半径按真实尺寸（米）给定，再换算成屏幕上的距离，所以远近物体的遮蔽范围一致。
const sampleFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uRadius;
  uniform float uStrength;
  ${depthGlsl}
  float hash(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  void main() {
    vec3 origin = viewPosition(vUv);
    // 太远的地方（窗外的城市）不参与，省掉无意义的计算。
    if (-origin.z > 40.0) { gl_FragColor = vec4(1.0); return; }
    vec3 normal = normalize(cross(dFdx(origin), dFdy(origin)));
    // 采样半径换算成画面比例：竖直方向按竖直视角，水平方向再除以宽高比，保证在场景里是个圆。
    vec2 reach = uRadius / (-origin.z * uLens * 2.0);
    float spin = hash(gl_FragCoord.xy) * 6.2831853;
    float occlusion = 0.0;
    const int SAMPLES = 11;
    for (int i = 0; i < SAMPLES; i++) {
      float fraction = (float(i) + 0.5) / float(SAMPLES);
      float angle = spin + fraction * 6.2831853 * 2.7;
      vec2 offset = vec2(cos(angle), sin(angle)) * reach * fraction;
      vec3 toSample = viewPosition(vUv + offset) - origin;
      float range = length(toSample);
      float facing = max(dot(normal, toSample / max(range, 1e-4)) - 0.08, 0.0);
      occlusion += facing * (1.0 - smoothstep(uRadius * 0.6, uRadius * 1.4, range));
    }
    gl_FragColor = vec4(vec3(clamp(1.0 - occlusion / float(SAMPLES) * uStrength, 0.0, 1.0)), 1.0);
  }
`

// 模糊时只混合深度相近的像素，遮蔽的暗部不会越过物体边缘渗到别处。
const blurFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tOcclusion;
  uniform vec2 uTexel;
  ${depthGlsl}
  void main() {
    float center = viewDepth(vUv);
    float sum = 0.0;
    float total = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
        float weight = 1.0 / (1.0 + abs(viewDepth(uv) - center) * 30.0);
        sum += texture2D(tOcclusion, uv).r * weight;
        total += weight;
      }
    }
    gl_FragColor = vec4(vec3(sum / total), 1.0);
  }
`

function createTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { format: RedFormat, type: UnsignedByteType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })
}

function lensUniforms() {
  return { tDepth: { value: null as Texture | null }, uLens: { value: new Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 100 } }
}

export class AmbientOcclusion {
  private readonly raw = createTarget()
  private readonly smooth = createTarget()
  private readonly sample = new ScreenPass(sampleFragment, { ...lensUniforms(), uRadius: { value: 0.55 }, uStrength: { value: 1.7 } })
  private readonly blur = new ScreenPass(blurFragment, { ...lensUniforms(), tOcclusion: { value: null as Texture | null }, uTexel: { value: new Vector2() } })

  /** 以主画面一半的分辨率计算，足够柔和且开销小。 */
  setSize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width / 2))
    const h = Math.max(2, Math.round(height / 2))
    this.raw.setSize(w, h)
    this.smooth.setSize(w, h)
    this.blur.uniforms.uTexel.value.set(1 / w, 1 / h)
  }

  /** 返回遮蔽图：1 表示完全不被遮挡，越接近 0 越暗。 */
  render(renderer: WebGLRenderer, depth: Texture, camera: PerspectiveCamera): Texture {
    const tangent = Math.tan((camera.fov * Math.PI) / 360)
    for (const uniforms of [this.sample.uniforms, this.blur.uniforms]) {
      uniforms.tDepth.value = depth
      uniforms.uLens.value.set(tangent * camera.aspect, tangent)
      uniforms.uNear.value = camera.near
      uniforms.uFar.value = camera.far
    }
    this.sample.render(renderer, this.raw)
    this.blur.uniforms.tOcclusion.value = this.raw.texture
    this.blur.render(renderer, this.smooth)
    return this.smooth.texture
  }

  dispose(): void {
    this.raw.dispose()
    this.smooth.dispose()
    this.sample.dispose()
    this.blur.dispose()
  }
}
