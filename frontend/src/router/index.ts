import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import StartupView from '@/views/StartupView.vue'
import { hasEntered, rememberTarget } from '@/stores/startupGate'

declare module 'vue-router' {
  interface RouteMeta {
    /** 独立全屏页面，不套公共侧栏和顶部区域。 */
    fullscreen?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'chat', component: ChatView },
    { path: '/welcome', name: 'startup', component: StartupView, meta: { fullscreen: true } },
    { path: '/matches', name: 'matches', component: () => import('@/views/MatchesView.vue') },
    { path: '/records', name: 'records', component: () => import('@/views/RecordsView.vue') },
    { path: '/statistics', name: 'statistics', component: () => import('@/views/StatisticsView.vue') },
    { path: '/memory', name: 'memory', component: () => import('@/views/MemoryView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// 每个标签页第一次打开网站时先到启动页；原本要去的地址记下来，进入系统后再前往。
router.beforeEach((to) => {
  if (to.name === 'startup' || hasEntered()) return true
  rememberTarget(to.fullPath)
  return { name: 'startup', replace: true }
})

export default router
