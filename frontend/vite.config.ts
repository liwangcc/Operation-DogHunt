import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 浏览器只请求 /api；由开发服务器转发，前端无需知道后台密钥。
  const proxy = {
    '/api': {
      target: env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
    // 启动页的 3D 场景已单独懒加载，约 700 kB，其中 three.js 核心约 600 kB，无法再细分；放宽提示线以免每次构建都告警。
    build: { chunkSizeWarningLimit: 800 },
  }
})
