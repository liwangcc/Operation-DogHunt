<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'

const route = useRoute()
</script>

<template>
  <!-- 全屏页面（启动页）不套公共布局；地址解析完成前先不渲染，避免侧栏闪现。 -->
  <RouterView v-if="route.meta.fullscreen" />
  <AppShell v-else-if="route.matched.length">
    <RouterView v-slot="{ Component }">
      <!-- 页面之间做一次很短的淡入；只缓存聊天页，切走再回来对话和输入都还在。 -->
      <Transition name="page" mode="out-in">
        <KeepAlive include="ChatView">
          <component :is="Component" />
        </KeepAlive>
      </Transition>
    </RouterView>
  </AppShell>
</template>
