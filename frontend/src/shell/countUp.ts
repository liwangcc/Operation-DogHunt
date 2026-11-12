// 数字滚动：数值变化时，显示的数字在半秒多一点的时间里过渡到新值。系统开启“减少动态效果”时直接跳到新值。
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

const DURATION_MS = 700

export function useCountUp(target: () => number | null): Ref<number | null> {
  const shown = ref<number | null>(null)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0

  watch(target, (to) => {
    window.cancelAnimationFrame(frame)
    const from = shown.value ?? 0
    if (to === null || still) {
      shown.value = to
      return
    }
    const started = performance.now()
    const step = (time: number) => {
      const progress = Math.min(1, (time - started) / DURATION_MS)
      // 先快后慢。
      const eased = 1 - (1 - progress) ** 3
      shown.value = from + (to - from) * eased
      if (progress < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
  }, { immediate: true })

  onBeforeUnmount(() => window.cancelAnimationFrame(frame))
  return shown
}
