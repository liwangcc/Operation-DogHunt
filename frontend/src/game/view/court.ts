// 球场地面：实木地板、按标准尺寸喷涂的场地线与中圈标识，以及地板清漆上的实时倒影。
import { CircleGeometry, Color, Matrix4, Mesh, Vector2, type CanvasTexture, type MeshPhysicalMaterial, type Texture } from 'three'
import { surfaceMaterial } from '@/startup/materials/surface'
import { paintHalfCourt, paintTexture, stroke } from '@/startup/textures/canvas'
import { paintHound, paintReticle } from '@/startup/textures/emblem'
import { COURT } from '../sim/constants'

const PAINT = { width: 4096, height: 2180 }
const KEY_COLOR = '#0e4756'

/** 场地喷漆：透明底上画白色场地线、深青色的禁区和中圈、中场的猎犬准星标识。透明处露出木地板。 */
function createPaint(): CanvasTexture {
  return paintTexture(PAINT.width, PAINT.height, (ctx, width, height) => {
    const scale = width / 94
    const top = (height - 50 * scale) / 2
    const y = (feet: number) => top + feet * scale
    const centerX = width / 2
    const centerY = y(25)
    ctx.fillStyle = KEY_COLOR
    ctx.globalAlpha = 0.9
    ctx.fillRect(0, y(17), 19 * scale, 16 * scale)
    ctx.fillRect(width - 19 * scale, y(17), 19 * scale, 16 * scale)
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#e9f4f7'
    ctx.strokeStyle = '#e9f4f7'
    paintReticle(ctx, centerX, centerY, 4.1 * scale)
    paintHound(ctx, centerX - 6, centerY + 6, 3.2 * scale)
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    ctx.lineWidth = 8
    ctx.strokeRect(4, top + 4, width - 8, 50 * scale - 8)
    stroke(ctx, () => {
      ctx.moveTo(centerX, top)
      ctx.lineTo(centerX, top + 50 * scale)
    })
    stroke(ctx, () => ctx.arc(centerX, centerY, 6 * scale, 0, Math.PI * 2))
    paintHalfCourt(ctx, (feet) => feet * scale, y, scale, false)
    paintHalfCourt(ctx, (feet) => (94 - feet) * scale, y, scale, true)
  })
}

const pars = /* glsl */ `
  uniform sampler2D uPaint;
  uniform vec2 uCourtHalf;
  uniform vec3 uApron;
  uniform sampler2D uMirrorMap;
  uniform mat4 uMirrorMatrix;
  uniform float uMirrorStrength;
  float courtPaint;
`

export interface CourtFloor {
  mesh: Mesh
  /** 每帧由管线回填倒影；传 null 关闭。 */
  setMirror: (texture: Texture | null, matrix: Matrix4) => void
  dispose: () => void
}

export function createCourtFloor(wood: Texture): CourtFloor {
  const paint = createPaint()
  const uniforms = {
    uPaint: { value: paint },
    uCourtHalf: { value: new Vector2(COURT.halfLength, COURT.halfWidth) },
    uApron: { value: new Color(0x0a1c26) },
    uMirrorMap: { value: null as Texture | null },
    uMirrorMatrix: { value: new Matrix4() },
    uMirrorStrength: { value: 0 },
  }
  const material: MeshPhysicalMaterial = surfaceMaterial(
    { color: 0xb88a55, metalness: 0, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.5 },
    { map: wood, scale: 0.5, bump: 0.35, rough: 0.25, tint: 0.7 },
    {
      key: 'court',
      uniforms,
      pars,
      // 界内贴场地喷漆；界外是一圈深色的缓冲区。
      albedo: /* glsl */ `
        vec2 courtUv = vSurfPos.xz / (uCourtHalf * 2.0) + 0.5;
        float inside = step(abs(vSurfPos.x), uCourtHalf.x) * step(abs(vSurfPos.z), uCourtHalf.y);
        vec4 paint = texture2D(uPaint, vec2(courtUv.x, 1.0 - courtUv.y));
        courtPaint = paint.a * inside;
        diffuseColor.rgb = mix(diffuseColor.rgb, paint.rgb, courtPaint * 0.94);
        diffuseColor.rgb = mix(diffuseColor.rgb, uApron, (1.0 - inside) * 0.9);
      `,
      output: /* glsl */ `
        {
          vec3 toEye = normalize(cameraPosition - vSurfPos);
          float fresnel = 0.05 + 0.95 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 5.0);
          vec4 projected = uMirrorMatrix * vec4(vSurfPos, 1.0);
          vec2 mirrorUv = projected.xy / projected.w + surfBend.xz * 0.012;
          // 倒影限制亮度：头顶的灯很亮，不压一下会在地板上映出一团团白斑。
          vec3 mirrored = min(textureLod(uMirrorMap, mirrorUv, 1.5 + roughnessFactor * 5.0).rgb, vec3(1.6));
          outgoingLight += mirrored * fresnel * uMirrorStrength * 0.55;
        }
      `,
    },
  )
  const mesh = new Mesh(new CircleGeometry(46, 64).rotateX(-Math.PI / 2), material)
  mesh.receiveShadow = true
  return {
    mesh,
    setMirror: (texture, matrix) => {
      uniforms.uMirrorMap.value = texture
      uniforms.uMirrorMatrix.value.copy(matrix)
      uniforms.uMirrorStrength.value = texture ? 1 : 0
    },
    dispose: () => {
      paint.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}
