// 全息投影总装：把球场结构、战术演示和光束组合起来，并负责开机时由暗到亮的启动过程。
import { Group, Vector3 } from 'three'
import { courtExtent } from '../../textures/court'
import { PROJECTOR_LENS_HEIGHT } from '../ceiling'
import { tableGlass, type Table } from '../table'
import { createBeams } from './beams'
import { createCourtHologram } from './court'
import { createPlayers, type CourtMapper } from './players'

/** 开机过程的时长（秒）：先闪几下，再稳定到全亮。 */
const BOOT_SECONDS = 2.4

function bootLevel(time: number): number {
  if (time >= BOOT_SECONDS) return 1
  const rise = time / BOOT_SECONDS
  const stutter = Math.sin(time * 38) * Math.sin(time * 13.7) > 0.2 ? 1 : 0.35
  return Math.min(1, rise * rise * 1.2) * (rise < 0.7 ? stutter : 1)
}

export interface Hologram {
  object: Group
  /** still 为 true 时跳过开机过程并停在起始站位（减少动态效果）。 */
  update: (time: number, still: boolean) => void
  /** 切到下一套战术。 */
  nextPlay: () => void
  setPixelRatio: (ratio: number) => void
}

export function createHologram(table: Table): Hologram {
  const extent = courtExtent(table.surfaceWidth)
  const scale = extent.length / 94
  const toCourt: CourtMapper = (spot, heightFeet, mirrored) =>
    new Vector3(((mirrored ? 94 - spot[0] : spot[0]) - 47) * scale, tableGlass.height + 0.004 + heightFeet * scale, (spot[1] - 25) * scale)

  const court = createCourtHologram(toCourt, extent.length, extent.width)
  const players = createPlayers(toCourt)
  const beams = createBeams(PROJECTOR_LENS_HEIGHT, tableGlass.height, table.lenses)
  const object = new Group()
  object.add(court.object, players.object, beams.object)

  let now = 0
  return {
    object,
    update: (time, still) => {
      now = time
      const master = still ? 1 : bootLevel(time)
      court.update(time, master)
      players.update(time, master, still)
      beams.update(time, master)
    },
    nextPlay: () => players.next(now),
    setPixelRatio: beams.setPixelRatio,
  }
}
