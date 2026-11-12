// 内页的动态背景：隔着落雨的玻璃看到的城市夜景，与启动页指挥室窗外是同一片夜色。
// 只用浏览器自带的 WebGL 画一张全屏图，不引入 three.js；按较低分辨率、每秒约 30 帧绘制，页面在后台时暂停。

const VERTEX = 'attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }'

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}

// 一层失焦的城市灯光：每个格子里最多一个圆形光斑，边缘比中心亮，缓慢明灭。
vec3 bokeh(vec2 uv, float scale, float seed, float t) {
  uv = uv * scale + seed * 13.7;
  vec2 id = floor(uv);
  vec2 f = fract(uv);
  vec3 col = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 cell = id + o;
      vec2 r = hash22(cell + seed);
      float keep = step(0.5, r.y);
      float d = length(f - (o + 0.15 + 0.7 * r));
      float radius = mix(0.16, 0.44, hash21(cell * 1.7 + seed));
      float disc = smoothstep(radius, radius * 0.8, d);
      float rim = smoothstep(radius * 0.5, radius, d);
      float twinkle = 0.55 + 0.45 * sin(t * (0.4 + r.x * 1.3) + r.y * 40.0);
      float hue = hash21(cell + seed * 3.1 + 5.0);
      vec3 tint = hue < 0.46 ? vec3(0.22, 0.78, 0.90) : hue < 0.8 ? vec3(0.95, 0.60, 0.28) : vec3(0.56, 0.70, 0.92);
      col += tint * disc * (0.7 + 0.3 * rim) * twinkle * keep;
    }
  }
  return col;
}

// 玻璃上下滑的水珠。返回 xy 为折射造成的画面偏移，z 为水珠本身的亮度。
vec3 drops(vec2 uv, float t, float scale, float seed) {
  float squash = 0.4;
  vec2 st = uv * vec2(scale, scale * squash);
  float column = floor(st.x);
  float speed = 0.22 + 0.3 * hash21(vec2(column, seed));
  // 走走停停：在匀速下滑上叠一个慢的起伏。
  st.y += t * speed + 0.12 * sin(t * 0.6 + column * 1.7) + hash21(vec2(column + 3.0, seed)) * 10.0;
  vec2 id = floor(st);
  vec2 f = fract(st) - 0.5;
  float r = hash21(id + seed);
  float keep = step(0.6, r);
  float x = (hash21(id + 9.1 + seed) - 0.5) * 0.56 + 0.05 * sin(st.y * 5.0 + r * 6.28);
  vec2 q = vec2(f.x - x, (f.y + 0.28) / squash);
  float size = 0.07 + 0.07 * r;
  float head = smoothstep(size, size * 0.35, length(q * vec2(1.0, 0.82)));
  float trail = smoothstep(size * 0.5, 0.0, abs(q.x)) * smoothstep(0.0, 0.25, q.y) * smoothstep(1.5, 0.3, q.y);
  vec2 offset = -q * head * 2.4 + vec2(q.x, 0.0) * trail * 1.2;
  return vec3(offset * keep, (head + trail * 0.25) * keep);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float t = uTime;
  vec3 near = drops(uv, t, 5.0, 1.0);
  vec3 far = drops(uv * 1.7 + 3.1, t * 1.2, 5.0, 2.0);
  vec2 bend = near.xy + far.xy * 0.6;
  vec2 p = uv + bend * 0.3 + uPointer * 0.02;

  // 城市在画面上方三分之一处：页面标题后面是天际线的灯火，往下渐渐暗下去，留给面板。
  float skyline = p.y - 0.36;
  vec3 col = mix(vec3(0.012, 0.028, 0.056), vec3(0.020, 0.048, 0.092), smoothstep(-1.0, 0.6, p.y));
  col += vec3(0.022, 0.105, 0.150) * exp(-pow(skyline * 2.1, 2.0));
  col += vec3(0.110, 0.055, 0.018) * exp(-pow((skyline + 0.36) * 3.2, 2.0));

  // 三层远近不同的灯光，指针移动时近的一层动得更多。
  float band = exp(-pow((skyline + 0.06) * 1.75, 2.0));
  vec3 lights = bokeh(p + uPointer * 0.015, 2.6, 1.0, t) * 0.62
    + bokeh(p + uPointer * 0.04, 4.6, 2.0, t) * 0.44
    + bokeh(p + uPointer * 0.08, 7.5, 3.0, t) * 0.30;
  col += lights * (0.04 + 0.96 * band) * 0.5;

  // 水珠：里面的景物被折射得更亮，边缘带一点高光。
  float wet = near.z + far.z * 0.5;
  col += vec3(0.38, 0.70, 0.82) * wet * (0.035 + 0.11 * band);
  col *= 1.0 - 0.30 * dot(uv * vec2(0.40, 0.55), uv * vec2(0.40, 0.55));
  col += (hash21(gl_FragCoord.xy + fract(t) * 61.0) - 0.5) * 0.008;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`

/** 画布横向最多画这么多像素，再由浏览器放大；光斑本来就是虚的，放大看不出来。 */
const MAX_WIDTH = 880
const FRAME_MS = 1000 / 30

export interface Backdrop {
  dispose(): void
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('无法创建着色器')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? '着色器编译失败')
  return shader
}

/**
 * 在 canvas 上开始绘制背景。still 为 true 时只画静止的一帧（系统开启了“减少动态效果”）。
 * WebGL 不可用时抛出错误，由调用方退回纯色背景；onLost 在显卡上下文丢失时调用。
 */
export function createBackdrop(canvas: HTMLCanvasElement, options: { still: boolean; onLost: () => void }): Backdrop {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  if (!gl) throw new Error('WebGL 不可用')

  const program = gl.createProgram()
  if (!program) throw new Error('无法创建着色程序')
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '着色程序链接失败')
  gl.useProgram(program)

  // 一个盖住整个画面的三角形。
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uRes = gl.getUniformLocation(program, 'uRes')
  const uTime = gl.getUniformLocation(program, 'uTime')
  const uPointer = gl.getUniformLocation(program, 'uPointer')

  let frame = 0
  let lastDraw = 0
  let disposed = false
  const started = performance.now()
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    const ratio = Math.min(1, MAX_WIDTH / width)
    const w = Math.round(width * ratio)
    const h = Math.round(height * ratio)
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    gl!.viewport(0, 0, w, h)
  }

  function draw(time: number): void {
    resize()
    pointer.x += (pointer.targetX - pointer.x) * 0.06
    pointer.y += (pointer.targetY - pointer.y) * 0.06
    gl!.uniform2f(uRes, canvas.width, canvas.height)
    // 从一个不为零的时刻开始，第一帧玻璃上就有水珠。
    gl!.uniform1f(uTime, 40 + (time - started) / 1000)
    gl!.uniform2f(uPointer, pointer.x, pointer.y)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  function loop(time: number): void {
    if (disposed) return
    frame = window.requestAnimationFrame(loop)
    if (time - lastDraw < FRAME_MS - 2) return
    lastDraw = time
    draw(time)
  }

  function onPointer(event: PointerEvent): void {
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1
    pointer.targetY = 1 - (event.clientY / window.innerHeight) * 2
  }

  /** 页面切到后台时停止绘制，回来后继续。 */
  function onVisibility(): void {
    window.cancelAnimationFrame(frame)
    if (!document.hidden && !options.still && !disposed) frame = window.requestAnimationFrame(loop)
  }

  function onResize(): void {
    if (options.still && !disposed) draw(started)
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    options.onLost()
  }

  canvas.addEventListener('webglcontextlost', onContextLost)
  window.addEventListener('resize', onResize)
  if (options.still) {
    draw(started)
  } else {
    window.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    frame = window.requestAnimationFrame(loop)
  }

  return {
    dispose() {
      disposed = true
      window.cancelAnimationFrame(frame)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
