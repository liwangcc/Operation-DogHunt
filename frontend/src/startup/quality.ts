// 画质：三个档位各自的开销上限，以及按实测帧耗时逐级降档的调节器（只降不升，避免来回抖动）。

export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityProfile {
  /** 像素密度上限：高分屏按这个值封顶，避免像素数量翻几倍。 */
  pixelRatio: number
  /** 主画面的多重采样数。 */
  samples: number
  bloomLevels: number
  /** 地面倒影相对主画面的分辨率比例；0 表示关闭。 */
  mirrorScale: number
  environmentSize: number
  textureSize: number
  shadowMapSize: number
  /** 是否计算环境光遮蔽（墙角、家具底部的自然暗部）。 */
  occlusion: boolean
}

export const QUALITY: Record<QualityTier, QualityProfile> = {
  high: { pixelRatio: 2, samples: 4, bloomLevels: 6, mirrorScale: 0.6, environmentSize: 256, textureSize: 1024, shadowMapSize: 2048, occlusion: true },
  medium: { pixelRatio: 1.5, samples: 4, bloomLevels: 5, mirrorScale: 0.5, environmentSize: 256, textureSize: 1024, shadowMapSize: 1024, occlusion: true },
  low: { pixelRatio: 1.25, samples: 0, bloomLevels: 4, mirrorScale: 0.35, environmentSize: 128, textureSize: 512, shadowMapSize: 1024, occlusion: false },
}

/** 触屏设备（手机、平板）默认从中档起步，其余从高档起步；之后由调节器按实际帧率下调。 */
export function initialTier(): QualityTier {
  return window.matchMedia('(pointer: coarse)').matches ? 'medium' : 'high'
}

/** 连续多少帧取一次平均。 */
const WINDOW = 90
/** 启动后先跳过的帧数，着色器首次编译的卡顿不计入。 */
const WARMUP = 60
/** 平均帧耗时超过这个值（约低于 36 FPS）就降一级。 */
const SLOW_FRAME_MS = 28
/** 超过这个值视为切换标签页等停顿，不计入。 */
const STALL_MS = 250

/** 一级降档；返回 false 表示这一级已经没有可降的内容。 */
export type QualityStep = () => boolean

export class QualityGovernor {
  private skipped = 0
  private frames = 0
  private total = 0
  private next = 0

  constructor(private readonly steps: QualityStep[]) {}

  /** 每帧调用一次，传入与上一帧的间隔毫秒数。 */
  sample(frameMs: number): void {
    if (this.next >= this.steps.length || frameMs > STALL_MS) return
    if (this.skipped < WARMUP) {
      this.skipped += 1
      return
    }
    this.frames += 1
    this.total += frameMs
    if (this.frames < WINDOW) return
    const average = this.total / this.frames
    this.frames = 0
    this.total = 0
    if (average > SLOW_FRAME_MS) this.downgrade()
  }

  private downgrade(): void {
    while (this.next < this.steps.length) {
      const applied = this.steps[this.next]()
      this.next += 1
      if (applied) return
    }
  }
}
