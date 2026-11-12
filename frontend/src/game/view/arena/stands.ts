// 看台结构：下层与上层的阶梯、前沿的护墙、两层之间的环形屏，以及把整个球馆围起来的外墙。
import { BackSide, BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type BufferGeometry, type ShaderMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MaterialKit } from '@/startup/materials/kit'
import { createBoardMaterial } from './boards'
import { LOWER, UPPER, banksOf, type Bank, type Tier } from './layout'

/** 一面看台的阶梯：每排一个从底座一直垫到台阶面的实心块，所以排与排之间没有缝。 */
function steps(tier: Tier, bank: Bank, floorY: number): BufferGeometry[] {
  const blocks: BufferGeometry[] = []
  const lengthwise = bank.along[0] !== 0
  for (let row = 0; row < tier.rows; row += 1) {
    const top = tier.base + row * tier.rise
    const out = bank.reach + (row + 0.5) * tier.depth
    const block = lengthwise ? new BoxGeometry(bank.half * 2, top - floorY, tier.depth) : new BoxGeometry(tier.depth, top - floorY, bank.half * 2)
    blocks.push(block.translate(bank.out[0] * out, (top + floorY) / 2, bank.out[1] * out))
  }
  return blocks
}

/** 竖在看台前沿、面朝球场的一块板（护墙或环形屏的底板）。 */
function fascia(bank: Bank, distance: number, bottom: number, top: number, thick: number): BufferGeometry {
  const lengthwise = bank.along[0] !== 0
  const wall = lengthwise ? new BoxGeometry(bank.half * 2, top - bottom, thick) : new BoxGeometry(thick, top - bottom, bank.half * 2)
  return wall.translate(bank.out[0] * distance, (top + bottom) / 2, bank.out[1] * distance)
}

export interface Stands {
  object: Group
  /** 环形屏的材质，由球馆统一推进动画和闪光。 */
  ribbons: ShaderMaterial[]
  dispose: () => void
}

export function createStands(kit: MaterialKit): Stands {
  const object = new Group()
  const concrete: BufferGeometry[] = []
  const ribbons: ShaderMaterial[] = []
  for (const bank of banksOf(LOWER, true)) {
    concrete.push(...steps(LOWER, bank, 0))
    concrete.push(fascia(bank, bank.reach - 0.12, 0, LOWER.base + 0.38, 0.2))
  }
  const walkway = LOWER.base + LOWER.rows * LOWER.rise
  for (const bank of banksOf(UPPER, false)) {
    concrete.push(...steps(UPPER, bank, walkway - 0.4))
    concrete.push(fascia(bank, bank.reach - 0.2, walkway - 0.4, UPPER.base + 0.4, 0.3))
    // 环形屏贴在上层看台前沿的立面上，朝着球场。
    const height = UPPER.base - walkway - 0.25
    const material = createBoardMaterial(bank.half * 2)
    const screen = new Mesh(new PlaneGeometry(bank.half * 2, height), material)
    screen.position.set(bank.out[0] * (bank.reach - 0.37), walkway + 0.2 + height / 2, bank.out[1] * (bank.reach - 0.37))
    screen.rotation.y = bank.turn
    object.add(screen)
    ribbons.push(material)
  }
  const structure = new Mesh(mergeGeometries(concrete), kit.materials.panel)
  concrete.forEach((geometry) => geometry.dispose())
  structure.receiveShadow = true
  // 外墙和顶棚：一个从里面看的大盒子，把球馆围起来，远处不再是一片虚空。
  const shell = new MeshStandardMaterial({ color: 0x0b1018, roughness: 0.9, side: BackSide })
  const hall = new Mesh(new BoxGeometry(104, 30, 84), shell)
  hall.position.y = 14.9
  object.add(structure, hall)
  return {
    object,
    ribbons,
    dispose: () => {
      structure.geometry.dispose()
      hall.geometry.dispose()
      shell.dispose()
      object.traverse((node) => (node as Mesh).geometry?.dispose())
    },
  }
}
