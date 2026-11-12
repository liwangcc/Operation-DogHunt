// 全息球场的固定结构：球场四周的光幕，以及两端按真实比例缩小的立体篮架（篮板、篮筐、篮网、支柱）。
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../layout'
import { createHoloMaterial, type HoloMaterial } from './material'
import { HOOP, HOOP_HEIGHT } from './plays'
import type { CourtMapper } from './players'

const curtainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 光幕自下而上淡出，带竖向的细刻度和一道缓慢上升的扫描光带。
const curtainFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uColumns;
  varying vec2 vUv;
  void main() {
    float rise = clamp(vUv.y, 0.0, 1.0);
    float fade = pow(1.0 - rise, 2.4);
    float tick = step(0.94, fract(vUv.x * uColumns)) * step(rise, 0.35);
    float sweep = smoothstep(0.08, 0.0, abs(rise - fract(uTime * 0.11)));
    float strength = fade * 0.55 + tick * 0.5 + sweep * 0.28 * (1.0 - rise);
    gl_FragColor = vec4(uColor * strength * uOpacity, 1.0);
  }
`

function createCurtain(length: number, width: number, base: number): { group: Group; materials: ShaderMaterial[] } {
  const rise = 0.5
  const group = new Group()
  const materials: ShaderMaterial[] = []
  const sides: Array<[number, number, number, number]> = [
    [length, 0, width / 2, 0],
    [length, 0, -width / 2, 0],
    [width, length / 2, 0, Math.PI / 2],
    [width, -length / 2, 0, Math.PI / 2],
  ]
  for (const [span, x, z, turn] of sides) {
    const material = new ShaderMaterial({
      vertexShader: curtainVertex,
      fragmentShader: curtainFragment,
      uniforms: { uColor: { value: new Color(palette.glow) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uColumns: { value: span * 8 } },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    const wall = new Mesh(new PlaneGeometry(span, rise), material)
    wall.position.set(x, base + rise / 2, z)
    wall.rotation.y = turn
    group.add(wall)
    materials.push(material)
  }
  return { group, materials }
}

/** 一个朝 +x 方向（面向场内）的篮架，原点在篮筐中心正下方的地面上；scale 是每英尺对应的米数。 */
function createHoopGeometry(scale: number): BufferGeometry {
  const rimHeight = HOOP_HEIGHT * scale
  const rimRadius = 0.9 * scale
  const boardX = -1.25 * scale
  const parts = [
    new TorusGeometry(rimRadius, 0.004, 8, 28).rotateX(Math.PI / 2).translate(0, rimHeight, 0),
    new CylinderGeometry(rimRadius, rimRadius * 0.62, 1.5 * scale, 12, 3, true).translate(0, rimHeight - 0.75 * scale, 0),
    new BoxGeometry(0.004, 3.5 * scale, 6 * scale).translate(boardX, rimHeight + 1.2 * scale, 0),
    new BoxGeometry(0.006, 1.5 * scale, 2 * scale).translate(boardX + 0.004, rimHeight + 0.75 * scale, 0),
    new BoxGeometry(0.012, rimHeight + 1.5 * scale, 0.012).translate(-4.6 * scale, (rimHeight + 1.5 * scale) / 2, 0),
    new BoxGeometry(3.4 * scale, 0.012, 0.012).translate(-2.9 * scale, rimHeight + 1.2 * scale, 0),
  ]
  return mergeGeometries(parts.map((part) => part.toNonIndexed()))
}

export interface CourtHologram {
  object: Group
  update: (time: number, master: number) => void
}

export function createCourtHologram(toCourt: CourtMapper, length: number, width: number): CourtHologram {
  const scale = length / 94
  const base = toCourt(HOOP, 0, false).y
  const curtain = createCurtain(length, width, base)
  const holo: HoloMaterial = createHoloMaterial(palette.glow, 0.5, 2.2)
  const object = new Group()
  object.add(curtain.group)
  for (const mirrored of [false, true]) {
    const hoop = new Mesh(createHoopGeometry(scale), holo.material)
    hoop.position.copy(toCourt(HOOP, 0, mirrored))
    hoop.rotation.y = mirrored ? Math.PI : 0
    object.add(hoop)
  }
  return {
    object,
    update: (time, master) => {
      holo.update(time, master)
      for (const material of curtain.materials) {
        material.uniforms.uTime.value = time
        material.uniforms.uOpacity.value = master
      }
    },
  }
}
