// 设备屏幕：用着色器画出会动的抽象界面（卡片、列表、图表、节点、滑块、对话、终端），不含任何数字或文字。
import { Color, ShaderMaterial } from 'three'
import { palette } from '../scene/layout'

/** 屏幕内容的种类，对应系统里的各个模块。 */
export type ScreenKind = 'matches' | 'records' | 'statistics' | 'memory' | 'settings' | 'assistant' | 'terminal'

const KIND_INDEX: Record<ScreenKind, number> = { matches: 0, records: 1, statistics: 2, memory: 3, settings: 4, assistant: 5, terminal: 6 }

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const screenFragment = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform float uGain;
  uniform vec3 uTint;
  uniform vec3 uAccent;
  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f);
  }
  /** 圆角矩形：p 是到矩形中心的偏移，extent 是半宽和半高，返回内部为 1 的遮罩。 */
  float box(vec2 p, vec2 extent, float radius) {
    vec2 d = abs(p) - extent + radius;
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
    return 1.0 - smoothstep(0.0, 0.004, dist);
  }
  float frame(vec2 p, vec2 extent, float radius, float width) {
    return box(p, extent, radius) - box(p, extent - width, max(radius - width, 0.0));
  }
  /** 一行“文字”：若干段长短不一的横条。 */
  float textLine(vec2 p, float width, float seed) {
    float x = p.x / width;
    if (x < 0.0 || x > 1.0 || abs(p.y) > 0.008) return 0.0;
    float word = floor(x * 7.0);
    return step(0.22, hash(vec2(word, seed))) * step(fract(x * 7.0), 0.82) * step(x, 0.35 + 0.65 * hash(vec2(seed, 2.0)));
  }

  // 比赛与盘口：两排卡片，每张卡片是两个队徽圆点加两条长短不一的横条，高亮框在卡片间轮流移动。
  vec3 matches(vec2 uv) {
    vec3 color = vec3(0.0);
    vec2 grid = vec2(3.0, 2.0);
    vec2 cell = vec2(uv.x, (uv.y - 0.04) / 0.82) * grid;
    vec2 id = floor(cell);
    vec2 p = (fract(cell) - 0.5) * vec2(uAspect / grid.x, 0.82 / grid.y);
    if (uv.y < 0.04 || uv.y > 0.86) return color;
    vec2 extent = vec2(uAspect / grid.x, 0.82 / grid.y) * 0.5 - 0.016;
    float focus = step(abs(id.x + id.y * 3.0 - floor(mod(uTime * 0.35, 6.0))), 0.5);
    color += mix(uTint * 0.5, uAccent, focus) * frame(p, extent, 0.012, 0.004);
    color += uTint * 0.05 * box(p, extent, 0.012);
    float logos = box(p - vec2(-extent.x * 0.55, extent.y * 0.35), vec2(0.024), 0.024) + box(p - vec2(extent.x * 0.55, extent.y * 0.35), vec2(0.024), 0.024);
    color += uTint * logos * 0.9;
    color += uTint * 0.6 * box(p - vec2(0.0, extent.y * 0.35), vec2(0.014, 0.003), 0.002);
    for (int row = 0; row < 2; row++) {
      float y = -extent.y * (0.2 + 0.42 * float(row));
      float fill = 0.25 + 0.6 * hash(id + float(row) * 3.1);
      float track = box(p - vec2(0.0, y), vec2(extent.x * 0.78, 0.007), 0.004);
      float bar = box(p - vec2(-extent.x * 0.78 * (1.0 - fill), y), vec2(extent.x * 0.78 * fill, 0.007), 0.004);
      color += uTint * track * 0.12 + mix(uTint, uAccent, float(row)) * bar * 0.85;
    }
    return color;
  }

  // 预测记录：缓慢向上滚动的列表，每行一个状态圆点、几段文字条和一个小标签。
  vec3 records(vec2 uv) {
    vec3 color = vec3(0.0);
    if (uv.y > 0.86) return color;
    float rows = 8.0;
    float y = uv.y * rows + uTime * 0.12;
    float id = floor(y);
    vec2 p = vec2(uv.x * uAspect, (fract(y) - 0.5) / rows);
    float good = step(0.4, hash(vec2(id, 7.0)));
    color += mix(uAccent, uTint, good) * box(p - vec2(0.05, 0.0), vec2(0.011), 0.011);
    color += uTint * 0.75 * textLine(p - vec2(0.1, 0.012), uAspect * 0.55, id);
    color += uTint * 0.35 * textLine(p - vec2(0.1, -0.014), uAspect * 0.4, id + 40.0);
    color += mix(uAccent, uTint, good) * 0.7 * frame(p - vec2(uAspect - 0.11, 0.0), vec2(0.06, 0.016), 0.016, 0.003);
    color += uTint * 0.1 * step(abs(fract(y) - 0.02), 0.012);
    return color;
  }

  // 效果统计：一条带面积填充的折线、底部一排柱子和淡淡的网格。
  vec3 statistics(vec2 uv) {
    vec3 color = vec3(0.0);
    if (uv.y > 0.86) return color;
    vec2 grid = abs(fract(vec2(uv.x * 10.0, uv.y * 6.0)) - 0.5);
    color += uTint * 0.07 * (step(0.48, grid.x) + step(0.47, grid.y));
    if (uv.y > 0.3) {
      float x = uv.x * 9.0 + uTime * 0.25;
      float curve = 0.42 + 0.3 * (noise(x) * 0.7 + noise(x * 2.3 + 5.0) * 0.3);
      float line = 1.0 - smoothstep(0.0, 0.012, abs(uv.y - curve));
      color += uTint * line * 1.2 + uTint * 0.22 * step(uv.y, curve) * (uv.y - 0.3);
      float second = 0.4 + 0.22 * noise(x * 0.8 + 20.0);
      color += uAccent * 0.9 * (1.0 - smoothstep(0.0, 0.008, abs(uv.y - second)));
    } else {
      float bars = uv.x * 16.0;
      float tall = 0.04 + 0.2 * noise(floor(bars) * 1.7 + floor(uTime * 0.5) * 0.3);
      color += mix(uTint, uAccent, step(0.8, hash(vec2(floor(bars), 3.0)))) * step(abs(fract(bars) - 0.5), 0.32) * step(uv.y, tall) * step(0.03, uv.y) * 0.85;
    }
    return color;
  }

  // 长期记忆：点阵里一圈圈向外扩散的波纹，少数节点常亮，像被反复调取的记忆。
  vec3 memory(vec2 uv) {
    vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.45);
    vec2 cell = p * 22.0;
    vec2 id = floor(cell);
    float bead = 1.0 - smoothstep(0.12, 0.2, length(fract(cell) - 0.5));
    float ripple = 0.5 + 0.5 * sin(length(id) * 0.9 - uTime * 1.6);
    float hot = step(0.93, hash(id));
    float link = step(0.9, hash(id + 5.0)) * step(abs(fract(cell.y) - 0.5), 0.05) * step(0.5, fract(cell.x + uTime * 0.6 + hash(id)));
    vec3 color = uTint * bead * (0.12 + 0.75 * ripple * ripple) + uAccent * bead * hot * 1.4 + uTint * link * 0.5;
    return color * step(uv.y, 0.86);
  }

  // 设置：几条带滑块的轨道和一列开关。
  vec3 settings(vec2 uv) {
    vec3 color = vec3(0.0);
    if (uv.y > 0.86) return color;
    float rows = 6.0;
    float id = floor(uv.y / 0.86 * rows);
    vec2 p = vec2(uv.x * uAspect, (fract(uv.y / 0.86 * rows) - 0.5) * 0.86 / rows);
    float knob = 0.2 + 0.6 * (0.5 + 0.5 * sin(uTime * 0.3 + id * 1.7)) * hash(vec2(id, 1.0)) + 0.1;
    float trackLength = uAspect * 0.52;
    color += uTint * 0.6 * textLine(p - vec2(0.05, 0.0), uAspect * 0.2, id + 3.0);
    vec2 track = p - vec2(uAspect * 0.3 + trackLength * 0.5, 0.0);
    color += uTint * 0.16 * box(track, vec2(trackLength * 0.5, 0.004), 0.004);
    color += uTint * 0.8 * box(track + vec2(trackLength * 0.5 * (1.0 - knob), 0.0), vec2(trackLength * 0.5 * knob, 0.004), 0.004);
    color += uAccent * box(track - vec2(trackLength * (knob - 0.5), 0.0), vec2(0.014), 0.014);
    float on = step(0.45, hash(vec2(id, 9.0)));
    vec2 toggle = p - vec2(uAspect - 0.08, 0.0);
    color += mix(uTint * 0.4, uTint, on) * frame(toggle, vec2(0.034, 0.016), 0.016, 0.003);
    color += mix(uTint * 0.5, uAccent, on) * box(toggle - vec2(mix(-0.016, 0.016, on), 0.0), vec2(0.01), 0.01);
    return color;
  }

  // AI 助手：左右交替的对话气泡，底部一条随时间起伏的声纹。
  vec3 assistant(vec2 uv) {
    vec3 color = vec3(0.0);
    if (uv.y > 0.86) return color;
    if (uv.y < 0.2) {
      float bars = uv.x * 48.0;
      float level = 0.02 + 0.07 * noise(floor(bars) * 0.6 + uTime * 3.0) * (0.4 + 0.6 * noise(uTime * 0.7));
      return uTint * step(abs(fract(bars) - 0.5), 0.3) * step(abs(uv.y - 0.1), level) * 1.1;
    }
    float rows = 4.0;
    float y = (uv.y - 0.2) / 0.66 * rows;
    float id = floor(y);
    float mine = step(0.5, mod(id, 2.0));
    vec2 size = vec2(uAspect * (0.3 + 0.12 * hash(vec2(id, 4.0))), 0.058);
    vec2 p = vec2(uv.x * uAspect, (fract(y) - 0.5) * 0.66 / rows) - vec2(mix(0.06 + size.x, uAspect - 0.06 - size.x, mine), 0.0);
    color += mix(uTint, uAccent, mine) * (frame(p, size, 0.022, 0.003) * 0.9 + box(p, size, 0.022) * 0.07);
    color += mix(uTint, uAccent, mine) * 0.7 * textLine(p - vec2(-size.x + 0.03, 0.014), size.x * 1.7, id + 11.0);
    color += mix(uTint, uAccent, mine) * 0.4 * textLine(p - vec2(-size.x + 0.03, -0.014), size.x * 1.2, id + 23.0);
    return color;
  }

  // 终端：快速滚动的日志行。
  vec3 terminal(vec2 uv) {
    float rows = 18.0;
    float y = uv.y * rows + uTime * 1.4;
    float id = floor(y);
    vec2 p = vec2(uv.x * uAspect - 0.04, (fract(y) - 0.5) / rows);
    float lineMask = textLine(p, uAspect * (0.3 + 0.6 * hash(vec2(id, 6.0))), id);
    vec3 color = mix(uTint, uAccent, step(0.9, hash(vec2(id, 8.0)))) * lineMask * 0.75;
    return color * step(uv.y, 0.86);
  }

  void main() {
    vec2 uv = vUv;
    vec3 color = vec3(0.0);
    #if KIND == 0
      color = matches(uv);
    #elif KIND == 1
      color = records(uv);
    #elif KIND == 2
      color = statistics(uv);
    #elif KIND == 3
      color = memory(uv);
    #elif KIND == 4
      color = settings(uv);
    #elif KIND == 5
      color = assistant(uv);
    #else
      color = terminal(uv);
    #endif
    // 顶部的标题栏：一段标题条和右侧三个小方块。
    vec2 bar = vec2(uv.x * uAspect, uv.y - 0.93);
    color += uTint * 0.9 * textLine(bar - vec2(0.05, 0.0), uAspect * 0.3, 99.0);
    for (int i = 0; i < 3; i++) color += mix(uTint * 0.6, uAccent, step(1.5, float(i))) * box(bar - vec2(uAspect - 0.05 - 0.04 * float(i), 0.0), vec2(0.011), 0.003);
    color += uTint * 0.25 * step(abs(uv.y - 0.875), 0.0015);
    // 屏幕底光、四周略暗、细扫描线。
    color += uTint * 0.035;
    color *= 0.82 + 0.18 * sin(uv.y * 520.0);
    color *= 1.0 - 0.35 * length((uv - 0.5) * vec2(1.0, 0.8));
    gl_FragColor = vec4(color * uGain, 1.0);
  }
`

export interface ScreenMaterial {
  material: ShaderMaterial
  update: (time: number) => void
}

/**
 * @param aspect 屏幕宽高比，保证圆点是圆的
 * @param gain 亮度倍数；大于 1 时会溢出一点泛光，像真的在发光
 */
export function createScreenMaterial(kind: ScreenKind, aspect: number, gain = 1.7): ScreenMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: aspect },
    uGain: { value: gain },
    uTint: { value: new Color(palette.glow) },
    uAccent: { value: new Color(palette.warm) },
  }
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: screenVertex,
    fragmentShader: screenFragment,
    defines: { KIND: KIND_INDEX[kind] },
  })
  return {
    material,
    update: (time) => {
      uniforms.uTime.value = time
    },
  }
}
