// 画布绘图的公共部分：创建贴图、描线，以及按真实比例绘制的篮球半场。
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

export type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

/**
 * 新建画布、交给 painter 作画，再包成贴图。默认白色描线，颜色由材质决定。
 * opaque 为 true 时先铺黑底：用作自发光贴图时，亮度由颜色深浅表示，而不是透明度。
 */
export function paintTexture(width: number, height: number, painter: Painter, opaque = false): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')
  if (opaque) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  painter(ctx, width, height)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 8
  return texture
}

export function stroke(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.beginPath()
  draw()
  ctx.stroke()
}

/**
 * 画半个球场（NBA 尺寸，单位英尺）：禁区、罚球圈、三分线、合理冲撞区、篮筐和篮板。
 * x(ft) 把“距底线的英尺数”换成画布坐标，画另一半时传入翻转后的换算并把 mirrored 设为 true。
 */
export function paintHalfCourt(
  ctx: CanvasRenderingContext2D,
  x: (feet: number) => number,
  y: (feet: number) => number,
  scale: number,
  mirrored: boolean,
): void {
  const hoopX = x(5.25)
  const centerY = y(25)
  const reach = Math.asin(22 / 23.75)
  const facing = mirrored ? Math.PI : 0
  const keyLeft = Math.min(x(0), x(19))
  ctx.save()
  ctx.globalAlpha *= 0.14
  ctx.fillRect(keyLeft, y(17), 19 * scale, 16 * scale)
  ctx.restore()
  ctx.strokeRect(keyLeft, y(17), 19 * scale, 16 * scale)
  stroke(ctx, () => ctx.arc(x(19), centerY, 6 * scale, 0, Math.PI * 2))
  stroke(ctx, () => ctx.arc(hoopX, centerY, 23.75 * scale, facing - reach, facing + reach))
  stroke(ctx, () => ctx.arc(hoopX, centerY, 4 * scale, facing - Math.PI / 2, facing + Math.PI / 2))
  stroke(ctx, () => ctx.arc(hoopX, centerY, 0.75 * scale, 0, Math.PI * 2))
  for (const side of [3, 47]) {
    stroke(ctx, () => {
      ctx.moveTo(x(0), y(side))
      ctx.lineTo(x(14.2), y(side))
    })
  }
  stroke(ctx, () => {
    ctx.moveTo(x(4), y(22))
    ctx.lineTo(x(4), y(28))
  })
  // 禁区两侧的站位标记。
  for (const mark of [7, 8, 11, 14]) {
    for (const edge of [17, 33]) {
      stroke(ctx, () => {
        ctx.moveTo(x(mark), y(edge))
        ctx.lineTo(x(mark), y(edge + (edge < 25 ? -0.8 : 0.8)))
      })
    }
  }
}
