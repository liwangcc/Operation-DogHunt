// 最终调色：把高动态范围的画面压进屏幕能显示的范围，并加上电影镜头的特征（色差、暗角、颗粒、冷暖分离）。
import { Vector2, type Texture } from 'three'
import { ScreenPass } from './fullscreen'

const gradeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tOcclusion;
  uniform float uOcclusion;
  uniform vec2 uResolution;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uAberration;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uFlash;

  // ACES 胶片曲线（Stephen Hill 的拟合）：高光平滑收敛而不是直接截断成一片白。
  const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 filmic(vec3 color) {
    color = ACES_IN * color;
    vec3 a = color * (color + 0.0245786) - 0.000090537;
    vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
    return clamp(ACES_OUT * (a / b), 0.0, 1.0);
  }
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  vec3 sceneAt(vec2 uv) {
    // 遮蔽只压暗场景本身，光晕不受影响。
    float shade = mix(1.0, texture2D(tOcclusion, uv).r, uOcclusion);
    return texture2D(tScene, uv).rgb * shade + texture2D(tBloom, uv).rgb * uBloom;
  }
  void main() {
    vec2 centered = vUv - 0.5;
    // 色差：越靠近画面边缘，红蓝两个通道错开得越多。
    vec2 shift = centered * dot(centered, centered) * uAberration;
    vec3 color = vec3(sceneAt(vUv + shift).r, sceneAt(vUv).g, sceneAt(vUv - shift).b);
    color *= uExposure * (1.0 + uFlash);
    color = filmic(color / 0.6);

    // 调色：暗部偏青、亮部偏暖，再加一点对比和饱和度。
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += vec3(-0.012, 0.004, 0.016) * (1.0 - smoothstep(0.0, 0.5, luma));
    color *= mix(vec3(1.0), vec3(1.045, 1.0, 0.94), smoothstep(0.45, 1.0, luma));
    color = mix(color, color * color * (3.0 - 2.0 * color), 0.22);
    color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.08);

    float aspect = uResolution.x / uResolution.y;
    float edge = length(centered * vec2(mix(1.0, aspect, 0.5), 1.0));
    color *= 1.0 - uVignette * smoothstep(0.38, 1.05, edge);

    // 线性 → sRGB。
    color = max(color, 0.0);
    color = mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, color));

    // 胶片颗粒：在暗部更明显，同时掩盖深色渐变里的色带。
    float grain = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
    color += grain * uGrain * (1.0 - 0.6 * luma);
    gl_FragColor = vec4(color, 1.0);
  }
`

export class Grade {
  readonly pass = new ScreenPass(gradeFragment, {
    tScene: { value: null as Texture | null },
    tBloom: { value: null as Texture | null },
    tOcclusion: { value: null as Texture | null },
    uOcclusion: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uBloom: { value: 0.16 },
    uExposure: { value: 1 },
    uAberration: { value: 0.0045 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  })

  dispose(): void {
    this.pass.dispose()
  }
}
