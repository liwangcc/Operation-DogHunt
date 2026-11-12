<script setup lang="ts">
// 六个模块各自的线条图标，画的是它在指挥室里对应的东西：战术桌、盘口屏、记录、曲线、机柜、控制面板。
import type { StationId } from '@/startup/scene/stations'

defineProps<{ id: StationId }>()
</script>

<template>
  <svg class="station-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="id === 'assistant'">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M12 5v14M3 9.5h2.5a2.5 2.5 0 0 1 0 5H3M21 9.5h-2.5a2.5 2.5 0 0 0 0 5H21" />
      <circle cx="12" cy="12" r="2.2" />
    </template>
    <template v-else-if="id === 'matches'">
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 20.5h8M12 17v3.5M7 9.5h4M7 12.5h2.5M14.5 9l2 2-2 2" />
    </template>
    <template v-else-if="id === 'records'">
      <path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z" />
      <path d="M15 3.5v4h4M9 12h7M9 15.5h7M9 8.5h3" />
    </template>
    <template v-else-if="id === 'statistics'">
      <path d="M3.5 4v16h17" />
      <path d="M6.5 15.5l4-5 3.5 3 5-7" />
      <circle cx="19" cy="6.5" r="1.2" />
    </template>
    <template v-else-if="id === 'memory'">
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M5 9h14M5 14.5h14M8 6.3h.01M8 11.8h.01M8 17.3h.01M11.5 6.3H16M11.5 11.8H16M11.5 17.3H16" />
    </template>
    <template v-else>
      <path d="M5 4v5M5 13v7M12 4v9M12 17v3M19 4v2M19 10v10" />
      <circle cx="5" cy="11" r="2" /><circle cx="12" cy="15" r="2" /><circle cx="19" cy="8" r="2" />
    </template>
  </svg>
</template>
