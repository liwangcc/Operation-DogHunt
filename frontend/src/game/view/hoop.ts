// 篮架：底座与伸臂、玻璃篮板、篮圈和会随进球摆动的篮网。
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  TorusGeometry,
} from 'three'
import type { MaterialKit } from '@/startup/materials/kit'
import { rbox } from '@/startup/scene/build'
import { COURT } from '../sim/constants'

const netVertex = /* glsl */ `
  uniform float uSwish;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // hang：0 在篮圈处，1 在网底。球穿过时网向外鼓、向下坠，并左右甩动。
    float hang = 1.0 - uv.y;
    vec3 moved = position;
    moved.xz *= 1.0 + uSwish * sin(hang * 3.14159) * 0.55;
    moved.y -= uSwish * hang * 0.1;
    moved.x += sin(uTime * 19.0 + hang * 4.0) * 0.035 * uSwish * hang;
    moved.z += cos(uTime * 16.0 + hang * 3.0) * 0.03 * uSwish * hang;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
  }
`

// 菱形网格：两组斜线交叉，线以外的部分直接丢弃。
const netFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float a = abs(sin((vUv.x * 12.0 + vUv.y * 5.0) * 3.14159));
    float b = abs(sin((vUv.x * 12.0 - vUv.y * 5.0) * 3.14159));
    if (max(a, b) < 0.86) discard;
    gl_FragColor = vec4(vec3(0.82, 0.84, 0.86) * (0.55 + 0.45 * vUv.y), 1.0);
  }
`

export interface Hoop {
  object: Group
  /** 进球：网甩动的强度（空心入网更大）。 */
  swish: (strength: number) => void
  /** 砸筐、扣篮：篮圈震动的强度。 */
  rattle: (strength: number) => void
  update: (time: number, delta: number) => void
  dispose: () => void
}

/** side 为 +1 或 -1：篮架在球场的哪一端。 */
export function createHoop(kit: MaterialKit, side: number): Hoop {
  const object = new Group()
  const frame = kit.materials.gunmetal
  const pad = new MeshStandardMaterial({ color: 0x0e4756, roughness: 0.7 })
  const glass = new MeshPhysicalMaterial({ color: 0xcfe6ee, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.2, side: DoubleSide })
  const white = new MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.5, emissive: new Color(0x99a3aa), emissiveIntensity: 0.25 })
  const orange = new MeshStandardMaterial({ color: 0xff5a1c, roughness: 0.35, metalness: 0.6, emissive: new Color(0xff3b0a), emissiveIntensity: 0.35 })
  const add = (mesh: Mesh, x: number, y: number, z: number, shadow = true): Mesh => {
    mesh.position.set(x * side, y, z)
    mesh.castShadow = shadow
    object.add(mesh)
    return mesh
  }
  const boardX = COURT.boardX + 0.02
  const boardY = (COURT.boardBottom + COURT.boardTop) / 2
  // 底座立在底线外，斜臂把篮板挑进场内。
  add(new Mesh(rbox(1.1, 1.3, 1.2, 0.08), pad), COURT.halfLength + 1.9, 0.65, 0)
  add(new Mesh(rbox(0.3, 2.6, 0.3, 0.03), frame), COURT.halfLength + 1.9, 2.3, 0)
  const arm = add(new Mesh(rbox(2.9, 0.24, 0.24, 0.03), frame), COURT.halfLength + 0.55, 3.45, 0)
  arm.rotation.z = side * 0.08
  add(new Mesh(new BoxGeometry(0.035, COURT.boardTop - COURT.boardBottom, COURT.boardHalfWidth * 2), glass), boardX, boardY, 0, false)
  // 篮板四边的白框和筐上方的小方框。
  const height = COURT.boardTop - COURT.boardBottom
  for (const [w, h, y, z] of [[1.83, 0.05, COURT.boardTop, 0], [1.83, 0.05, COURT.boardBottom, 0], [0.05, height, boardY, 0.915], [0.05, height, boardY, -0.915], [0.59, 0.04, 3.5, 0], [0.04, 0.45, 3.28, 0.295], [0.04, 0.45, 3.28, -0.295]]) {
    add(new Mesh(new BoxGeometry(0.04, h, w), white), boardX - 0.005, y, z, false)
  }

  // 篮圈和篮网挂在一个可以震动的支点上。
  const rim = new Group()
  rim.position.set(side * COURT.boardX, COURT.rimHeight, 0)
  const ring = new Mesh(new TorusGeometry(COURT.rimRadius, 0.012, 10, 40).rotateX(Math.PI / 2), orange)
  ring.position.x = -side * (COURT.boardX - COURT.hoopX)
  ring.castShadow = true
  const bracket = new Mesh(new BoxGeometry(0.16, 0.03, 0.12), orange)
  bracket.position.x = -side * 0.08
  const netUniforms = { uSwish: { value: 0 }, uTime: { value: 0 } }
  const netMaterial = new ShaderMaterial({ vertexShader: netVertex, fragmentShader: netFragment, uniforms: netUniforms, side: DoubleSide })
  const net = new Mesh(new CylinderGeometry(COURT.rimRadius, COURT.rimRadius * 0.56, 0.42, 24, 8, true), netMaterial)
  net.position.set(ring.position.x, -0.21, 0)
  rim.add(ring, bracket, net)
  object.add(rim)

  let shake = 0
  return {
    object,
    swish: (strength) => {
      netUniforms.uSwish.value = Math.max(netUniforms.uSwish.value, strength)
    },
    rattle: (strength) => {
      shake = Math.max(shake, strength)
    },
    update: (time, delta) => {
      netUniforms.uTime.value = time
      netUniforms.uSwish.value *= Math.exp(-delta * 3.2)
      shake *= Math.exp(-delta * 5)
      rim.rotation.z = side * Math.sin(time * 42) * 0.05 * shake
      rim.position.y = COURT.rimHeight - Math.abs(Math.sin(time * 42)) * 0.03 * shake
    },
    dispose: () => {
      for (const material of [pad, glass, white, orange, netMaterial]) material.dispose()
      object.traverse((node) => (node as Mesh).geometry?.dispose())
    },
  }
}
