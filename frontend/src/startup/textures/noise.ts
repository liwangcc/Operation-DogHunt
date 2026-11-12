// 可无缝平铺的噪声 GLSL 片段：贴图生成器的各个配方都在它之上组合。

/**
 * 所有函数都以“贴图坐标 0–1 + 整数频率”为输入，频率为整数时结果在 0–1 上首尾相接。
 * - hash12 / hash22：伪随机数
 * - vnoise：平滑噪声，可在两个方向使用不同频率（用于拉丝纹）
 * - fbm：多层叠加的噪声，产生云雾状的起伏
 * - voronoi：细胞纹，返回 (到最近点的距离, 到次近点的距离, 细胞随机值)
 */
export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  vec2 hash22(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
  }
  float vnoise(vec2 uv, vec2 freq) {
    vec2 p = uv * freq;
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(mod(i, freq));
    float b = hash12(mod(i + vec2(1.0, 0.0), freq));
    float c = hash12(mod(i + vec2(0.0, 1.0), freq));
    float d = hash12(mod(i + vec2(1.0, 1.0), freq));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 uv, float freq, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float total = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      sum += amp * vnoise(uv + float(i) * 0.37, vec2(freq));
      total += amp;
      freq *= 2.0;
      amp *= 0.5;
    }
    return sum / total;
  }
  vec3 voronoi(vec2 uv, float freq) {
    vec2 p = uv * freq;
    vec2 i = floor(p);
    vec2 f = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 cell = mod(i + g, freq);
        vec2 r = g + hash22(cell) - f;
        float d = dot(r, r);
        if (d < nearest) { second = nearest; nearest = d; id = hash12(cell + 7.7); }
        else if (d < second) { second = d; }
      }
    }
    return vec3(sqrt(nearest), sqrt(second), id);
  }
`
