// 场景总装：把室内、室外各部分拼成两个场景，并向渲染管线和舞台提供统一的操作入口。
import { Color, Scene, type CubeTexture, type Matrix4, type Texture, type WebGLRenderer } from 'three'
import { createMaterialKit, type MaterialKit } from '../materials/kit'
import type { RenderWorld } from '../render/pipeline'
import { createCeiling } from './ceiling'
import { createConsoles } from './consoles'
import { createHologram } from './hologram'
import { createLighting } from './lighting'
import { createLounge } from './lounge'
import { createMarker } from './marker'
import { createArena } from './outdoor/arena'
import { createCity } from './outdoor/city'
import { createSky } from './outdoor/sky'
import { createTraffic } from './outdoor/traffic'
import { createRearWall } from './rearwall'
import { createShell } from './shell'
import type { Station } from './stations'
import { createTable } from './table'
import { createWeather, type Lightning } from './weather'

export interface WorldOptions {
  /** 表面细节贴图的边长。 */
  textureSize: number
  shadowMapSize: number
  /** 减少动态效果：场景只画静止的一帧，不打闪、不播放战术。 */
  still: boolean
}

export interface World extends RenderWorld {
  /** 推进待机动效并返回当前的闪电状态；time 为场景运行秒数，delta 为距上一帧的秒数。减少动态效果时不会被调用。 */
  update: (time: number, delta: number) => Lightning
  /** 在某个站点脚下亮起提示光环；传 null 熄灭。 */
  setMarker: (station: Station | null, instant: boolean) => void
  /** 全息球场切到下一套战术。 */
  nextPlay: () => void
  /** 绘图缓冲区尺寸或像素密度变化。 */
  setViewport: (width: number, height: number, pixelRatio: number) => void
  /** 室内环境反射就绪后交给所有物理材质。 */
  setEnvironment: (texture: Texture) => void
  /** 材质库：比赛场景复用同一套材质和细节贴图，不必重新生成。 */
  kit: MaterialKit
  dispose: () => void
}

export function buildWorld(renderer: WebGLRenderer, options: WorldOptions): World {
  const kit = createMaterialKit(renderer, options.textureSize)
  const shell = createShell(kit)
  const table = createTable(kit)
  const hologram = createHologram(table)
  const consoles = createConsoles(kit)
  const rearWall = createRearWall(kit)
  const lighting = createLighting(options.shadowMapSize)
  const sky = createSky()
  const city = createCity()
  const traffic = createTraffic()
  const arena = createArena()
  const marker = createMarker()
  const weather = options.still ? null : createWeather()
  const calm: Lightning = { level: 0, azimuth: 0, struck: false }

  const interior = new Scene()
  interior.background = new Color(0x000000)
  interior.add(shell.object, createCeiling(kit), table.object, hologram.object, consoles.object, createLounge(kit), rearWall.object, marker.object, lighting.object)

  const outdoor = new Scene()
  outdoor.add(sky.object, city.object, traffic.object, arena.object)

  return {
    kit,
    interior,
    outdoor,
    setBackdrop: (texture: Texture) => shell.glass.setBackdrop(texture),
    setPanoramaMode: (enabled: boolean) => shell.glass.setPanoramaMode(enabled),
    setPanoramas: (outside: CubeTexture, inside: CubeTexture | null) => shell.glass.setPanoramas(outside, inside),
    setMirror: (texture: Texture | null, matrix: Matrix4) => shell.floor.setMirror(texture, matrix),
    setFloorVisible: (visible: boolean) => {
      shell.floor.mesh.visible = visible
    },
    setMarker: marker.show,
    nextPlay: hologram.nextPlay,
    update: (time, delta) => {
      marker.update(time, delta)
      shell.glass.setTime(time)
      table.update(time)
      hologram.update(time, options.still)
      consoles.update(time)
      rearWall.update(time)
      sky.update(time)
      city.update(time)
      traffic.update(time)
      arena.update(time)
      const lightning = weather ? weather.update(time) : calm
      sky.flash(lightning.level, lightning.azimuth)
      lighting.flash(lightning.level, lightning.azimuth)
      return lightning
    },
    setViewport: (width, height, pixelRatio) => {
      shell.glass.setResolution(width, height)
      city.setPixelRatio(pixelRatio)
      hologram.setPixelRatio(pixelRatio)
    },
    setEnvironment: (texture) => {
      interior.environment = texture
    },
    dispose: () => {
      shell.dispose()
      table.dispose()
      consoles.dispose()
      rearWall.dispose()
      kit.dispose()
      disposeGeometries(interior)
      disposeGeometries(outdoor)
    },
  }
}

/** 释放场景里所有网格的几何体与自带材质（材质库里的共享材质由材质库自己释放，重复释放无害）。 */
function disposeGeometries(scene: Scene): void {
  scene.traverse((node) => {
    const drawable = node as unknown as {
      geometry?: { dispose: () => void }
      material?: { dispose: () => void } | Array<{ dispose: () => void }>
      dispose?: () => void
      isInstancedMesh?: boolean
    }
    drawable.geometry?.dispose()
    const materials = Array.isArray(drawable.material) ? drawable.material : drawable.material ? [drawable.material] : []
    materials.forEach((material) => material.dispose())
    if (drawable.isInstancedMesh) drawable.dispose?.()
  })
}
