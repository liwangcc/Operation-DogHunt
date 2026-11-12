// 战术桌台面显示的整块球场：球场线、细网格与四周的刻度，全部为抽象图形，不含数字。
import type { CanvasTexture } from 'three'
import { paintHalfCourt, paintTexture, stroke } from './canvas'

/** 贴图宽高比与桌面玻璃（5.5 × 3.5 米）一致；四周留出一圈放刻度和装饰。 */
export const COURT_TEXTURE = { width: 2048, height: 1304, margin: 150 } as const

function paintGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save()
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.07
  for (let x = 0; x <= width; x += 32) {
    stroke(ctx, () => {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    })
  }
  for (let y = 0; y <= height; y += 32) {
    stroke(ctx, () => {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    })
  }
  ctx.restore()
}

/** 球场四周的刻度尺和角标，像测绘图纸的边框。 */
function paintFrame(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number): void {
  ctx.save()
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.55
  const pad = 30
  for (let i = 0; i <= 94; i += 2) {
    const x = left + (w * i) / 94
    const tick = i % 10 === 0 ? 18 : 8
    for (const edge of [top - pad, top + h + pad]) {
      stroke(ctx, () => {
        ctx.moveTo(x, edge)
        ctx.lineTo(x, edge + (edge < top ? tick : -tick))
      })
    }
  }
  for (let i = 0; i <= 50; i += 2) {
    const y = top + (h * i) / 50
    const tick = i % 10 === 0 ? 18 : 8
    for (const edge of [left - pad, left + w + pad]) {
      stroke(ctx, () => {
        ctx.moveTo(edge, y)
        ctx.lineTo(edge + (edge < left ? tick : -tick), y)
      })
    }
  }
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 4
  const arm = 44
  for (const [cx, cy, dx, dy] of [[left - pad, top - pad, 1, 1], [left + w + pad, top - pad, -1, 1], [left - pad, top + h + pad, 1, -1], [left + w + pad, top + h + pad, -1, -1]]) {
    stroke(ctx, () => {
      ctx.moveTo(cx + dx * arm, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + dy * arm)
    })
  }
  ctx.restore()
}

export function createCourtTexture(): CanvasTexture {
  const { width, height, margin } = COURT_TEXTURE
  return paintTexture(width, height, (ctx) => {
    const scale = (width - margin * 2) / 94
    const left = margin
    const top = (height - 50 * scale) / 2
    const y = (feet: number) => top + feet * scale
    paintGrid(ctx, width, height)
    paintFrame(ctx, left, top, 94 * scale, 50 * scale)
    ctx.save()
    ctx.globalAlpha = 0.07
    ctx.fillRect(left, top, 94 * scale, 50 * scale)
    ctx.restore()
    ctx.lineWidth = 6
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 14
    ctx.strokeRect(left, top, 94 * scale, 50 * scale)
    stroke(ctx, () => {
      ctx.moveTo(left + 47 * scale, top)
      ctx.lineTo(left + 47 * scale, top + 50 * scale)
    })
    stroke(ctx, () => ctx.arc(left + 47 * scale, y(25), 6 * scale, 0, Math.PI * 2))
    stroke(ctx, () => ctx.arc(left + 47 * scale, y(25), 2 * scale, 0, Math.PI * 2))
    paintHalfCourt(ctx, (feet) => left + feet * scale, y, scale, false)
    paintHalfCourt(ctx, (feet) => left + (94 - feet) * scale, y, scale, true)
  }, true)
}

/** 球场在台面上的实际尺寸（米），由贴图比例和台面铺设宽度换算，供全息内容对齐。 */
export function courtExtent(surfaceWidth: number): { length: number; width: number } {
  const scale = (COURT_TEXTURE.width - COURT_TEXTURE.margin * 2) / 94
  const metersPerPixel = surfaceWidth / COURT_TEXTURE.width
  return { length: 94 * scale * metersPerPixel, width: 50 * scale * metersPerPixel }
}
