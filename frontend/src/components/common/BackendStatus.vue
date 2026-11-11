<script setup lang="ts">
import { useBackendHealth } from '@/composables/useBackendHealth'

const { status, message, version, check } = useBackendHealth()
</script>

<template>
  <div class="backend-status">
    <span class="status-dot" :class="status" aria-hidden="true"></span>
    <span role="status" :title="message">
      {{ status === 'online' ? '后端已连接' : status === 'checking' ? '连接检查中' : '后端未连接' }}
    </span>
    <span v-if="version" class="version">v{{ version }}</span>
    <button class="text-button" :disabled="status === 'checking'" @click="check">检查连接</button>
  </div>
  <p v-if="status === 'offline'" class="connection-error" role="alert">{{ message }}</p>
</template>
