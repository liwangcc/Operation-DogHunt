<script setup lang="ts">
// 球队标记：一块带队色的斜切牌子，上面是三个字母的缩写。不使用任何球队的官方标志。
import { computed } from 'vue'
import { team } from '@/components/odds/format'

const props = defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>()
const info = computed(() => team(props.name))
</script>

<template>
  <span class="team-mark" :class="size ?? 'md'" :style="{ '--team': info[2] }" aria-hidden="true"><span>{{ info[1] }}</span></span>
</template>

<style scoped>
.team-mark {
  display: inline-grid; place-items: center; flex: 0 0 auto; width: 46px; height: 30px; border: 1px solid color-mix(in srgb, var(--team) 72%, #fff); border-radius: 3px; transform: skewX(-12deg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--team) 88%, #fff), color-mix(in srgb, var(--team) 58%, #050b14));
  box-shadow: 0 0 16px color-mix(in srgb, var(--team) 32%, transparent), inset 0 1px 0 rgba(255, 255, 255, .22);
}
.team-mark span { transform: skewX(12deg); font-size: 12px; font-style: italic; font-weight: 800; letter-spacing: .04em; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .55); }
.sm { width: 36px; height: 22px; }
.sm span { font-size: 10px; }
.lg { width: 68px; height: 44px; }
.lg span { font-size: 18px; }
</style>
