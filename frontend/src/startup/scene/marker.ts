// 站点提示光环：指针悬停或选中某个站点时，在它脚下的地面上亮起一圈缓慢转动的虚线光环。
import { AdditiveBlending, Color, Mesh, RingGeometry, ShaderMaterial } from 'three'
import { palette } from './layout'
import type { Station } from './stations'

const markerVertex = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 外圈是转动的虚线，内侧一圈淡淡的实线；亮度随时间轻微起伏。
const markerFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uRadius;
  varying vec2 vPlane;
  void main() {
    // 换算成米，线宽就不会随光环大小变粗。
    float radius = length(vPlane) * uRadius;
    float turn = atan(vPlane.y, vPlane.x) / 6.28318530718;
    float dashes = step(0.42, fract(turn * floor(14.0 * uRadius) + uTime * 0.12));
    float outer = smoothstep(uRadius - 0.05, uRadius - 0.04, radius) * smoothstep(uRadius, uRadius - 0.01, radius) * dashes;
    float inner = smoothstep(uRadius - 0.13, uRadius - 0.124, radius) * smoothstep(uRadius - 0.112, uRadius - 0.118, radius) * 0.5;
    float pulse = 0.75 + 0.25 * sin(uTime * 2.4);
    gl_FragColor = vec4(uColor * (outer + inner) * pulse * uOpacity, 1.0);
  }
`

export interface Marker {
  object: Mesh
  /** 把光环移到某个站点脚下；传 null 则淡出。instant 为 true 时不做淡入淡出（减少动态效果时使用）。 */
  show: (station: Station | null, instant: boolean) => void
  /** time 为场景运行秒数，delta 为距上一帧的秒数。 */
  update: (time: number, delta: number) => void
}

export function createMarker(): Marker {
  const uniforms = { uColor: { value: new Color(palette.glow).multiplyScalar(2.6) }, uTime: { value: 0 }, uOpacity: { value: 0 }, uRadius: { value: 1 } }
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: markerVertex,
    fragmentShader: markerFragment,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const object = new Mesh(new RingGeometry(0.6, 1, 128), material)
  object.rotation.x = -Math.PI / 2
  object.visible = false
  let wanted = 0
  return {
    object,
    show: (station, instant) => {
      wanted = station ? 1 : 0
      if (instant) {
        uniforms.uOpacity.value = wanted
        object.visible = wanted > 0
      }
      if (!station) return
      object.position.set(station.ring.center.x, 0.012, station.ring.center.z)
      object.scale.setScalar(station.ring.radius)
      uniforms.uRadius.value = station.ring.radius
    },
    update: (time, delta) => {
      uniforms.uTime.value = time
      const step = Math.min(1, delta * 6)
      uniforms.uOpacity.value += (wanted - uniforms.uOpacity.value) * step
      object.visible = uniforms.uOpacity.value > 0.01
    },
  }
}
