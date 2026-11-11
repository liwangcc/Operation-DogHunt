import { onMounted, ref } from 'vue'
import { getHealth } from '@/api/health'

export function useBackendHealth() {
  const status = ref<'checking' | 'online' | 'offline'>('checking')
  const message = ref('正在检查后端连接')
  const version = ref('')
  let pending = false

  async function check() {
    if (pending) return
    pending = true
    status.value = 'checking'
    message.value = '正在检查后端连接'
    version.value = ''
    try {
      const health = await getHealth()
      status.value = 'online'
      message.value = '后端已连接'
      version.value = health.version
    } catch (error) {
      status.value = 'offline'
      message.value = error instanceof Error ? error.message : '连接检查失败'
    } finally {
      pending = false
    }
  }

  onMounted(check)
  return { status, message, version, check }
}
