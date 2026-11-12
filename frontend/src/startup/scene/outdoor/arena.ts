// 城市里的球馆：穹顶、一圈亮着灯的外廊、屋顶光环，以及在雨雾中缓慢摆动的探照灯光柱。
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { room } from '../layout'
import { HAZE } from './city'

/** 球馆在城市里的位置：初始镜头的左前方，离房间约 340 米。 */
const SITE = { x: -150, z: -305 }
const RADIUS = 58
const WALL = 20

/** 把颜色按球馆所在距离的雾化程度调好：这些材质不走楼群的雾化着色器，所以在这里预先算进去。 */
function hazed(color: Color): Color {
  const range = Math.hypot(SITE.x, SITE.z)
  return HAZE.color.clone().lerp(color, Math.exp(-range * HAZE.density))
}

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vAlong = uv.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// 光柱越往上越淡（几何体翻转后，贴图坐标在灯头处为 1、在顶端为 0）；和室内的光束一样按“表面正对镜头的程度”取亮度，轮廓处自然消失。
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 toEye = normalize(cameraPosition - vWorld);
    float facing = pow(abs(dot(normalize(vNormalW), toEye)), 1.3);
    float fade = clamp(vAlong, 0.0, 1.0);
    gl_FragColor = vec4(uColor * facing * fade * fade, 1.0);
  }
`

export interface Arena {
  object: Group
  update: (time: number) => void
}

export function createArena(): Arena {
  const ground = room.cityGround
  const object = new Group()
  object.position.set(SITE.x, ground, SITE.z)

  const shell = new MeshBasicMaterial({ color: hazed(new Color(0.02, 0.026, 0.04)) })
  const wall = new Mesh(new CylinderGeometry(RADIUS, RADIUS * 0.96, WALL, 64, 1, true), shell)
  wall.position.y = WALL / 2
  const dome = new Mesh(new SphereGeometry(RADIUS, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell)
  dome.scale.y = 0.42
  dome.position.y = WALL

  // 外廊的玻璃幕墙整圈亮着暖白色的灯，是球馆最醒目的一条光带。
  const concourse = new Mesh(
    new CylinderGeometry(RADIUS + 0.4, RADIUS + 0.4, 6, 64, 1, true),
    new MeshBasicMaterial({ color: hazed(new Color(3.4, 2.7, 1.9)), side: DoubleSide }),
  )
  concourse.position.y = 9
  const crown = new Mesh(new TorusGeometry(RADIUS * 0.62, 0.9, 8, 64), new MeshBasicMaterial({ color: hazed(new Color(0.5, 2.6, 3.0)) }))
  crown.rotation.x = Math.PI / 2
  crown.position.y = WALL + RADIUS * 0.42 * 0.78
  object.add(wall, dome, concourse, crown)

  // 四束探照灯从球馆四周打向天空。圆柱的顶端收成细点并作为转动的支点，所以先把几何体下移半个高度。
  const beamMaterial = new ShaderMaterial({
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    uniforms: { uColor: { value: new Color(0.09, 0.12, 0.19) } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  const reach = 420
  const beams: Mesh[] = []
  for (let i = 0; i < 4; i += 1) {
    const geometry = new CylinderGeometry(2.5, 17, reach, 20, 1, true).rotateX(Math.PI).translate(0, reach / 2, 0)
    const beam = new Mesh(geometry, beamMaterial)
    const angle = (i / 4) * Math.PI * 2 + 0.6
    beam.position.set(Math.cos(angle) * (RADIUS + 12), 4, Math.sin(angle) * (RADIUS + 12))
    beam.frustumCulled = false
    beams.push(beam)
    object.add(beam)
  }
  return {
    object,
    update: (time) => {
      beams.forEach((beam, i) => {
        beam.rotation.x = 0.32 * Math.sin(time * 0.13 + i * 1.7)
        beam.rotation.z = 0.36 * Math.sin(time * 0.1 + i * 2.3 + 1.1)
      })
    },
  }
}
