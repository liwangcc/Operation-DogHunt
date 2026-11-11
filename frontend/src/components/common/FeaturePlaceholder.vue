<script setup lang="ts">
defineProps<{ title: string; description: string; items: string[] }>()
</script>

<template>
  <section class="page-section">
    <span class="eyebrow">后续功能 · 待开发</span>
    <h1>{{ title }}</h1>
    <p class="page-description">{{ description }}</p>
    <div class="placeholder-panel">
      <h2>这里将提供</h2>
      <ul><li v-for="item in items" :key="item">{{ item }}</li></ul>
      <p class="muted">当前仅预留页面入口，尚未连接业务数据。</p>
    </div>
  </section>
</template>
