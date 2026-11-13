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
/* 一块平的铭牌：左边一道队色，上面是缩写。像地图上标注单位的小牌子。 */
.team-mark {
  display: inline-grid; place-items: center; flex: 0 0 auto; width: 44px; height: 26px;
  border: 1px solid color-mix(in srgb, var(--team) 42%, transparent); border-left: 3px solid var(--team); border-radius: var(--radius);
  background: color-mix(in srgb, var(--team) 15%, #0b1116);
}
.team-mark span { font-family: var(--font-num); font-size: 12px; font-weight: 600; letter-spacing: .08em; line-height: 1; color: #e9f0f2; }
.sm { width: 36px; height: 20px; border-left-width: 2px; }
.sm span { font-size: 10.5px; letter-spacing: .06em; }
.lg { width: 66px; height: 38px; border-left-width: 4px; }
.lg span { font-size: 17px; }
</style>
