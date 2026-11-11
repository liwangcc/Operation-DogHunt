<script setup lang="ts">
import AppShell from '@/components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <KeepAlive include="ChatView">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </AppShell>
</template>
