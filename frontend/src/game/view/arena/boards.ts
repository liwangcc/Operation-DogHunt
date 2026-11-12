// 场边的 LED 屏：滚动的箭头图案材质，以及沿边线、底线摆放的围挡。进球时整条闪成进球方的颜色。
import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { palette } from '@/startup/scene/layout'
import { COURT } from '../../sim/constants'

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 两种队色交替的箭头图案不停滚动，带一点 LED 点阵的扫描线。
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  uniform vec3 uA;
  uniform vec3 uB;
  varying vec2 vUv;
  void main() {
    float along = vUv.x * uLength * 0.4 - uTime * 0.7;
    float chevron = step(0.5, fract(along + abs(vUv.y - 0.5) * 1.3));
    vec3 color = mix(uA, uB, step(0.5, fract(along * 0.125))) * (0.18 + 0.82 * chevron);
    color *= 0.82 + 0.18 * sin(vUv.y * 110.0);
    color = mix(color, uFlashColor * (0.6 + 0.4 * sin(uTime * 34.0 + vUv.x * uLength * 3.0)), uFlash);
    gl_FragColor = vec4(color * 1.7, 1.0);
  }
`

/** length 是屏的长度（米），用来让不同长度的屏上图案一样大。 */
export function createBoardMaterial(length: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: length },
      uFlash: { value: 0 },
      uFlashColor: { value: new Color(1, 1, 1) },
      uA: { value: new Color(palette.glow) },
      uB: { value: new Color(palette.warm) },
    },
  })
}

/** 沿两条边线各一整条围挡，底线后篮架两侧各一段。 */
export function createBoards(): { group: Group; materials: ShaderMaterial[] } {
  const group = new Group()
  const materials: ShaderMaterial[] = []
  const place = (length: number, x: number, z: number, turn: number): void => {
    const material = createBoardMaterial(length)
    const board = new Mesh(new PlaneGeometry(length, 0.85), material)
    board.position.set(x, 0.5, z)
    board.rotation.y = turn
    group.add(board)
    materials.push(material)
  }
  const sideZ = COURT.halfWidth + 2.6
  place(COURT.halfLength * 2 + 2, 0, -sideZ, 0)
  place(COURT.halfLength * 2 + 2, 0, sideZ, Math.PI)
  const endX = COURT.halfLength + 4
  for (const z of [-5.2, 5.2]) {
    place(6.4, -endX, z, Math.PI / 2)
    place(6.4, endX, z, -Math.PI / 2)
  }
  return { group, materials }
}
