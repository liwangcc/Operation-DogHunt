// 观众：坐在座位上的简化人形（座椅、腿、躯干、头，欢呼时举起的双臂），没有五官，全部用实例化绘制。
// 进球时一部分人站起来跳、举手，看台上零星亮起相机的闪光。
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
  type IUniform,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette, seededRandom } from '@/startup/scene/layout'
import { LOWER, UPPER, banksOf, seatsOf, type Seat } from './layout'

/** 衣服的颜色：大多是深色便装，夹杂两队的应援色。 */
const CLOTHES = [0x1c2733, 0x2a3846, 0x35424f, 0x24324a, 0x2c2c38, 0x3a3f48, 0x4a3344, 0x202a30]
const FAN_COLORS = [0x127f92, 0x0e6676, 0xb06a1c, 0x8a5418]
const HEADS = [0x4a5560, 0x59636d, 0x3c454e, 0x6a7078]

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))
  parts.forEach((part) => part.dispose())
  return geometry
}

/** 座椅：坐垫加靠背。原点在这一排台阶面上，面朝 +z。 */
function seatShape(): BufferGeometry {
  return merged([new BoxGeometry(0.5, 0.06, 0.42).translate(0, 0.42, 0), new BoxGeometry(0.5, 0.44, 0.05).translate(0, 0.66, -0.21)])
}

function legShape(): BufferGeometry {
  return merged([new BoxGeometry(0.36, 0.13, 0.42).translate(0, 0.5, 0.13), new BoxGeometry(0.34, 0.44, 0.13).translate(0, 0.22, 0.31)])
}

function torsoShape(): BufferGeometry {
  const body = new CylinderGeometry(0.2, 0.165, 0.48, 8).scale(1, 1, 0.62).translate(0, 0.77, 0)
  const shoulders = new SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.62).translate(0, 1.01, 0)
  return merged([body, shoulders])
}

function armShape(): BufferGeometry {
  return merged([-1, 1].map((side) => new BoxGeometry(0.07, 0.42, 0.07).translate(0, 0.21, 0).rotateZ(-side * 0.32).translate(side * 0.2, 1.0, 0.02)))
}

/**
 * 让一种材质的实例随欢呼而动：站起来、上下跳，平时只有很轻微的晃动。
 * @param hidden 为 true 时平常缩成身体里的一个点，看不见，欢呼时才伸出来（举起的手臂）
 */
function animate(material: MeshStandardMaterial, uniforms: Record<string, IUniform>, hidden: boolean): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCheer;\nuniform float uTime;\nuniform float uExcite;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float join = smoothstep(aCheer, aCheer + 0.12, uExcite * 1.12);
        transformed.y += join * (0.2 + 0.1 * abs(sin(uTime * 7.0 + aCheer * 40.0)));
        transformed.x += sin(uTime * 1.1 + aCheer * 50.0) * 0.012 * position.y;
        ${hidden ? 'transformed = mix(vec3(0.0, 0.75, 0.0), transformed, join);' : ''}`,
      )
  }
  material.customProgramCacheKey = () => `crowd:${hidden ? 'arms' : 'body'}`
  return material
}

function place(mesh: InstancedMesh, seats: Seat[]): void {
  const dummy = new Object3D()
  seats.forEach((seat, index) => {
    dummy.position.set(seat.x, seat.y, seat.z)
    dummy.rotation.y = seat.turn
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

// 闪光灯：每个点在自己的时间片里偶尔亮一下。
const flashVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uExcite;
  varying float vOn;
  void main() {
    float slot = floor(uTime * 9.0 + aSeed * 7.0);
    float roll = fract(sin(slot * 12.9898 + aSeed * 78.233) * 43758.5453);
    vOn = step(1.0 - 0.05 * uExcite, roll) * uExcite;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = vOn * 240.0 / max(1.0, -view.z);
    gl_Position = projectionMatrix * view;
  }
`

const flashFragment = /* glsl */ `
  varying float vOn;
  void main() {
    float glow = max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0);
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * glow * glow * vOn * 5.0, 1.0);
  }
`

export interface Crowd {
  objects: Object3D[]
  /** 进球：观众兴奋的程度（0–1），随后慢慢平复。 */
  cheer: (strength: number) => void
  update: (time: number, delta: number) => void
  dispose: () => void
}

export function createCrowd(): Crowd {
  const random = seededRandom(5150)
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } }
  const lower = banksOf(LOWER, true).flatMap((bank) => seatsOf(LOWER, bank))
  const upper = banksOf(UPPER, false).flatMap((bank) => seatsOf(UPPER, bank))
  const allSeats = [...lower, ...upper]
  // 上座率九成左右，空位随机分布。
  const fans = allSeats.filter(() => random() < 0.9)
  const cheer = new Float32Array(fans.length)
  for (let i = 0; i < fans.length; i += 1) cheer[i] = random()

  const plastic = new MeshStandardMaterial({ color: 0x0f1a26, roughness: 0.6 })
  const cloth = new MeshStandardMaterial({ color: 0x141a22, roughness: 0.95 })
  const shirt = animate(new MeshStandardMaterial({ roughness: 0.9 }), uniforms, false)
  const skin = animate(new MeshStandardMaterial({ roughness: 0.8 }), uniforms, false)
  const sleeve = animate(new MeshStandardMaterial({ roughness: 0.9 }), uniforms, true)
  const materials = [plastic, cloth, shirt, skin, sleeve]

  const seats = new InstancedMesh(seatShape(), plastic, allSeats.length)
  place(seats, allSeats)
  const legs = new InstancedMesh(legShape(), cloth, fans.length)
  const torsos = new InstancedMesh(torsoShape(), shirt, fans.length)
  const heads = new InstancedMesh(new SphereGeometry(0.105, 8, 6).translate(0, 1.17, 0.01), skin, fans.length)
  const arms = new InstancedMesh(armShape(), sleeve, fans.length)
  const meshes = [seats, legs, torsos, heads, arms]
  for (const mesh of [legs, torsos, heads, arms]) place(mesh, fans)
  for (const mesh of [torsos, heads, arms]) mesh.geometry.setAttribute('aCheer', new InstancedBufferAttribute(cheer, 1))
  const tint = new Color()
  fans.forEach((_, index) => {
    const fan = random() < 0.42
    tint.set(fan ? FAN_COLORS[Math.floor(random() * FAN_COLORS.length)] : CLOTHES[Math.floor(random() * CLOTHES.length)])
    torsos.setColorAt(index, tint)
    arms.setColorAt(index, tint)
    heads.setColorAt(index, tint.set(HEADS[Math.floor(random() * HEADS.length)]))
  })
  for (const mesh of meshes) {
    mesh.castShadow = false
    mesh.receiveShadow = false
    // 实例铺满了整个球馆，不必逐帧判断是否在视野内。
    mesh.frustumCulled = false
  }

  // 相机闪光：从观众里抽一部分人的头顶位置。
  const flashAt: number[] = []
  const seeds: number[] = []
  fans.forEach((seat) => {
    if (random() > 0.16) return
    flashAt.push(seat.x, seat.y + 1.25, seat.z)
    seeds.push(random() * 100)
  })
  const flashGeometry = new BufferGeometry()
  flashGeometry.setAttribute('position', new Float32BufferAttribute(flashAt, 3))
  flashGeometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1))
  const flashMaterial = new ShaderMaterial({ vertexShader: flashVertex, fragmentShader: flashFragment, uniforms, blending: AdditiveBlending, depthWrite: false, transparent: true })
  const flashes = new Points(flashGeometry, flashMaterial)
  flashes.frustumCulled = false

  // 让看台灯光下的衣服带一点队色的环境色，不至于死黑。
  shirt.emissive = new Color(palette.glow).multiplyScalar(0.012)
  let excitement = 0
  return {
    objects: [...meshes, flashes],
    cheer: (strength) => {
      excitement = Math.max(excitement, strength)
    },
    update: (time, delta) => {
      excitement *= Math.exp(-delta * 0.75)
      uniforms.uTime.value = time
      uniforms.uExcite.value = excitement
    },
    dispose: () => {
      meshes.forEach((mesh) => {
        mesh.geometry.dispose()
        mesh.dispose()
      })
      materials.forEach((material) => material.dispose())
      flashGeometry.dispose()
      flashMaterial.dispose()
    },
  }
}
