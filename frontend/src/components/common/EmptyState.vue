<script setup lang="ts">
// 空状态：没有内容可显示时，说明现状和原因；按钮等操作通过插槽放进来。
defineProps<{ title: string; tone?: 'plain' | 'warn' }>()
</script>

<template>
  <div class="empty" :class="tone ?? 'plain'">
    <svg class="empty-mark" viewBox="0 0 64 40" width="64" height="40" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
      <rect x="1" y="1" width="62" height="38" rx="2" />
      <path d="M32 1v38M1 12h8a8 8 0 0 1 0 16H1M63 12h-8a8 8 0 0 0 0 16h8" />
      <circle cx="32" cy="20" r="6" />
    </svg>
    <h2>{{ title }}</h2>
    <div class="empty-body"><slot /></div>
    <div v-if="$slots.actions" class="empty-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; padding: 52px 24px; border: 1px dashed var(--line-2); border-radius: var(--radius-lg); background: rgba(11, 16, 21, .6); text-align: center; }
.empty-mark { color: var(--text-3); opacity: .6; }
.warn .empty-mark { color: var(--amber); opacity: .8; }
h2 { margin: 18px 0 0; font-size: 16px; font-weight: 600; letter-spacing: .04em; }
.empty-body { max-width: 56ch; margin-top: 8px; font-size: 13px; line-height: 1.8; color: var(--text-2); }
.empty-body :deep(p) { margin: 0; }
.empty-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 20px; }
</style>
