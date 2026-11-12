// 球馆：把看台、观众、场边设施、顶部的记分屏和灯光装到一起，并统一处理进球时的全场反应。
import { Color, DirectionalLight, Group, HemisphereLight, type ShaderMaterial } from 'three'
import type { MaterialKit } from '@/startup/materials/kit'
import { palette } from '@/startup/scene/layout'
import { createBoards } from './boards'
import { createCourtside } from './courtside'
import { createCrowd } from './crowd'
import { createRigging, type ScoreLine } from './rigging'
import { createStands } from './stands'

/** 场地灯光：一盏带阴影的主光从转播机位一侧的高处打下来，对面一盏冷色的轮廓光，再加一层天光。 */
function createLights(): Group {
  const group = new Group()
  const key = new DirectionalLight(0xfff3e2, 3)
  key.position.set(5, 24, 9)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -17, right: 17, top: 11, bottom: -11, near: 6, far: 44 })
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.03
  const rim = new DirectionalLight(0xbcd6ff, 1.4)
  rim.position.set(-7, 15, -12)
  const fill = new DirectionalLight(0xffe9d2, 0.35)
  fill.position.set(-4, 7, 18)
  group.add(key, key.target, rim, rim.target, fill, fill.target, new HemisphereLight(0xc9dcff, 0x241a10, 0.45))
  return group
}

export interface Arena {
  object: Group
  /** 开场从正上方俯视时，把吊在中央的记分屏和灯架藏起来，免得挡住球场。 */
  setRigVisible: (visible: boolean) => void
  /** 进球：所有屏闪成进球方的颜色，观众起立欢呼，看台上亮起闪光灯。 */
  celebrate: (team: number, strength: number) => void
  /** 更新中央记分屏上的比分和时间。 */
  setScore: (line: ScoreLine) => void
  update: (time: number, delta: number) => void
  dispose: () => void
}

export function createArena(kit: MaterialKit): Arena {
  const object = new Group()
  const stands = createStands(kit)
  const crowd = createCrowd()
  const boards = createBoards()
  const courtside = createCourtside(kit)
  const rigging = createRigging(kit)
  object.add(stands.object, ...crowd.objects, boards.group, courtside.object, rigging.object, createLights())
  const screens: ShaderMaterial[] = [...boards.materials, ...stands.ribbons, ...courtside.screens]
  const teamColors = [new Color(palette.glow), new Color(palette.warm)]
  return {
    object,
    setRigVisible: (visible) => {
      rigging.hanging.visible = visible
    },
    celebrate: (team, strength) => {
      crowd.cheer(strength)
      for (const material of screens) {
        material.uniforms.uFlash.value = 1
        material.uniforms.uFlashColor.value.copy(teamColors[team])
      }
    },
    setScore: rigging.setScore,
    update: (time, delta) => {
      crowd.update(time, delta)
      for (const material of screens) {
        material.uniforms.uTime.value = time
        material.uniforms.uFlash.value *= Math.exp(-delta * 1.8)
      }
    },
    dispose: () => {
      stands.dispose()
      crowd.dispose()
      courtside.dispose()
      rigging.dispose()
      boards.materials.forEach((material) => material.dispose())
      stands.ribbons.forEach((material) => material.dispose())
      boards.group.traverse((node) => (node as { geometry?: { dispose: () => void } }).geometry?.dispose())
    },
  }
}
