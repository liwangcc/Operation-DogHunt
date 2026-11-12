// 给物理材质叠加一层“按世界坐标三向投影”的细节贴图：微小凹凸、粗糙度与明暗变化，模型无需贴图坐标。
import { MeshPhysicalMaterial, type IUniform, type MeshPhysicalMaterialParameters, type Texture } from 'three'

export interface SurfaceDetail {
  /** forge 生成的细节贴图（RG 法线、B 粗糙度、A 明暗）。 */
  map: Texture
  /** 每米重复多少次。 */
  scale: number
  /** 凹凸、粗糙度变化、明暗变化的强度。 */
  bump?: number
  rough?: number
  tint?: number
  /** 贴图按哪个坐标系投影：默认按世界坐标（静止的场景）；会动的物体用 object，纹理才会跟着它走。 */
  space?: 'world' | 'object'
}

/** 在材质着色器的固定位置插入的额外代码，用于地面这类需要特殊效果的表面。 */
export interface SurfaceExtension {
  uniforms?: Record<string, IUniform>
  /** 额外的全局声明（uniform、函数）。 */
  pars?: string
  /** 细节采样完成后：可修改 diffuseColor、totalEmissiveRadiance。 */
  albedo?: string
  /** 可修改 roughnessFactor。 */
  roughness?: string
  /** 可修改 metalnessFactor。 */
  metalness?: string
  /** 输出前：可修改 outgoingLight。 */
  output?: string
  /** 让带有不同扩展的材质各自编译，取任意唯一名字。 */
  key: string
}

const parsVertex = /* glsl */ `
  varying vec3 vSurfPos;
  varying vec3 vSurfNormal;
`

const worldVertex = /* glsl */ `
  vec4 surfWorld = vec4(transformed, 1.0);
  vec3 surfNormal = objectNormal;
  #ifdef USE_INSTANCING
    surfWorld = instanceMatrix * surfWorld;
    surfNormal = mat3(instanceMatrix) * surfNormal;
  #endif
  vSurfPos = (modelMatrix * surfWorld).xyz;
  vSurfNormal = normalize(mat3(modelMatrix) * surfNormal);
`

const objectVertex = /* glsl */ `
  vSurfPos = transformed;
  vSurfNormal = objectNormal;
`

// 三个方向各投影一次，按表面朝向加权混合；法线偏移先在投影所用的坐标系里累加，再转到视图坐标。
const parsFragment = /* glsl */ `
  uniform sampler2D uSurfMap;
  uniform float uSurfScale;
  uniform vec3 uSurfAmp;
  varying vec3 vSurfPos;
  varying vec3 vSurfNormal;
  vec4 surfDetail;
  vec3 surfBend;
  void sampleSurface() {
    vec3 weight = pow(abs(normalize(vSurfNormal)), vec3(6.0));
    weight /= weight.x + weight.y + weight.z;
    vec3 p = vSurfPos * uSurfScale;
    vec4 tx = texture2D(uSurfMap, p.zy);
    vec4 ty = texture2D(uSurfMap, p.xz);
    vec4 tz = texture2D(uSurfMap, p.xy);
    surfDetail = tx * weight.x + ty * weight.y + tz * weight.z;
    vec2 nx = tx.xy * 2.0 - 1.0;
    vec2 ny = ty.xy * 2.0 - 1.0;
    vec2 nz = tz.xy * 2.0 - 1.0;
    surfBend = vec3(0.0, nx.y, nx.x) * weight.x + vec3(ny.x, 0.0, ny.y) * weight.y + vec3(nz.x, nz.y, 0.0) * weight.z;
  }
`

function inject(source: string, anchor: string, code: string, before = false): string {
  if (!source.includes(anchor)) throw new Error(`Shader anchor not found: ${anchor}`)
  return source.replace(anchor, before ? `${code}\n${anchor}` : `${anchor}\n${code}`)
}

/** 创建带细节贴图的物理材质；detail 省略时就是普通的物理材质。 */
export function surfaceMaterial(
  parameters: MeshPhysicalMaterialParameters,
  detail?: SurfaceDetail,
  extension?: SurfaceExtension,
): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial(parameters)
  if (!detail) return material
  const uniforms: Record<string, IUniform> = {
    uSurfMap: { value: detail.map },
    uSurfScale: { value: detail.scale },
    uSurfAmp: { value: [detail.bump ?? 1, detail.rough ?? 0.5, detail.tint ?? 0.5] },
    ...extension?.uniforms,
  }
  material.userData.uniforms = uniforms
  const local = detail.space === 'object'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = inject(shader.vertexShader, '#include <common>', parsVertex)
    shader.vertexShader = inject(shader.vertexShader, '#include <project_vertex>', local ? objectVertex : worldVertex)
    // 片元着色器默认没有声明 normalMatrix；按物体坐标投影时要用它把法线偏移转到视图坐标。
    const declarations = `${local ? 'uniform mat3 normalMatrix;' : ''}\n${parsFragment}\n${extension?.pars ?? ''}`
    let fragment = inject(shader.fragmentShader, '#include <common>', declarations)
    fragment = inject(
      fragment,
      '#include <color_fragment>',
      `sampleSurface();
       diffuseColor.rgb *= 1.0 + (surfDetail.a - 0.5) * 2.0 * uSurfAmp.z;
       ${extension?.albedo ?? ''}`,
    )
    fragment = inject(
      fragment,
      '#include <roughnessmap_fragment>',
      `roughnessFactor = clamp(roughnessFactor + (surfDetail.b - 0.5) * 2.0 * uSurfAmp.y, 0.04, 1.0);
       ${extension?.roughness ?? ''}`,
    )
    if (extension?.metalness) fragment = inject(fragment, '#include <metalnessmap_fragment>', extension.metalness)
    const toView = local ? 'normalMatrix' : 'mat3(viewMatrix)'
    fragment = inject(fragment, '#include <normal_fragment_maps>', `normal = normalize(normal + ${toView} * surfBend * uSurfAmp.x);`)
    if (extension?.output) fragment = inject(fragment, '#include <opaque_fragment>', extension.output, true)
    shader.fragmentShader = fragment
  }
  material.customProgramCacheKey = () => `surface:${extension?.key ?? 'plain'}:${local ? 'object' : 'world'}`
  return material
}
