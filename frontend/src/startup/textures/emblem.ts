// 实墙上的项目标识：准星里的猎犬头像，加上 OPERATION DOGHUNT 字样。
import type { CanvasTexture } from 'three'
import { paintTexture, stroke } from './canvas'

/** 标识贴图的宽高比，墙上的发光面按这个比例裁切。 */
export const EMBLEM_ASPECT = 2048 / 640

/** 猎犬侧脸的轮廓（朝右），坐标以头像中心为原点、单位为头像半径。 */
const HOUND: Array<[number, number]> = [
  [-0.62, 0.5], [-0.5, -0.02], [-0.56, -0.62], [-0.3, -0.34], [-0.06, -0.5], [0.16, -0.3], [0.44, -0.18],
  [0.78, -0.02], [0.84, 0.1], [0.72, 0.2], [0.46, 0.22], [0.3, 0.34], [0.12, 0.3], [-0.04, 0.5], [-0.2, 0.68],
]

export function paintHound(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath()
  HOUND.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * radius, cy + y * radius) : ctx.moveTo(cx + x * radius, cy + y * radius)))
  ctx.closePath()
  ctx.fill()
  // 眼睛：从轮廓里挖掉一小块。
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.moveTo(cx + 0.16 * radius, cy - 0.12 * radius)
  ctx.lineTo(cx + 0.36 * radius, cy - 0.06 * radius)
  ctx.lineTo(cx + 0.18 * radius, cy - 0.02 * radius)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 准星：一圈圆环、四个方向的刻线，像瞄准镜里的十字。 */
export function paintReticle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.lineWidth = 10
  stroke(ctx, () => ctx.arc(cx, cy, radius, 0, Math.PI * 2))
  ctx.lineWidth = 4
  stroke(ctx, () => ctx.arc(cx, cy, radius * 1.14, -0.5, 0.5))
  stroke(ctx, () => ctx.arc(cx, cy, radius * 1.14, Math.PI - 0.5, Math.PI + 0.5))
  ctx.lineWidth = 8
  for (let i = 0; i < 4; i += 1) {
    const angle = (i * Math.PI) / 2
    stroke(ctx, () => {
      ctx.moveTo(cx + Math.cos(angle) * radius * 0.84, cy + Math.sin(angle) * radius * 0.84)
      ctx.lineTo(cx + Math.cos(angle) * radius * 1.24, cy + Math.sin(angle) * radius * 1.24)
    })
  }
}

export function createEmblemTexture(): CanvasTexture {
  return paintTexture(2048, 640, (ctx, width, height) => {
    const cy = height / 2
    paintReticle(ctx, 330, cy, 190)
    paintHound(ctx, 322, cy + 6, 150)
    ctx.textBaseline = 'alphabetic'
    ctx.font = "italic 300 120px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    ctx.fillText('OPERATION', 640, cy - 62)
    ctx.font = "italic 800 232px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    ctx.fillText('DOGHUNT', 628, cy + 136)
    ctx.globalAlpha = 0.7
    ctx.fillRect(640, cy + 176, width - 640 - 150, 5)
    ctx.fillRect(1360, cy - 118, 150, 22)
  }, true)
}
