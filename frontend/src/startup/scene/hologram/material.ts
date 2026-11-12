// 全息投影的材质：边缘更亮的半透明体、细密的扫描线和轻微的闪烁，统一用叠加发光的方式绘制。
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, ShaderMaterial, type Texture } from 'three'

const holoVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTint;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 localNormal = normal;
    vTint = vec3(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      localNormal = mat3(instanceMatrix) * localNormal;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * localNormal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const holoFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFill;
  uniform float uRim;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTint;
  void main() {
    vec3 toEye = normalize(cameraPosition - vWorld);
    float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalW), toEye)), 0.0, 1.0), 2.2);
    float scan = 0.72 + 0.28 * sin(vWorld.y * 260.0 - uTime * 5.0);
    float flicker = 0.93 + 0.07 * sin(uTime * 37.0 + vWorld.x * 5.0) * sin(uTime * 11.3);
    float strength = (uFill + rim * uRim) * scan * flicker * uOpacity;
    gl_FragColor = vec4(uColor * vTint * strength, 1.0);
  }
`

export interface HoloMaterial {
  material: ShaderMaterial
  /** time 为场景运行秒数；opacity 用于开机、切换时的淡入淡出。 */
  update: (time: number, opacity: number) => void
}

/** 有体积感的全息实体（站位棋子、篮架等）：fill 是整体亮度，rim 是轮廓亮度。 */
export function createHoloMaterial(color: number, fill = 0.25, rim = 2.4): HoloMaterial {
  const uniforms = {
    uColor: { value: new Color(color) },
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uFill: { value: fill },
    uRim: { value: rim },
  }
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: holoVertex,
    fragmentShader: holoFragment,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  return {
    material,
    update: (time, opacity) => {
      uniforms.uTime.value = time
      uniforms.uOpacity.value = opacity
    },
  }
}

/** 纯色发光面或发光线：intensity 大于 1 时会溢出泛光。 */
export function createGlowMaterial(color: number, intensity: number, map?: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(color).multiplyScalar(intensity),
    map: map ?? null,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}
