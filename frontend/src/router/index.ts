import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import StartupView from '@/views/StartupView.vue'
import { hasEntered, rememberTarget } from '@/stores/startupGate'

declare module 'vue-router' {
  interface RouteMeta {
    /** 独立全屏页面，不套公共侧栏和顶部区域。 */
    fullscreen?: boolean
    /** 浏览器标签页上显示的页面名。 */
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'chat', component: ChatView, meta: { title: 'NBA 助手' } },
    { path: '/welcome', name: 'startup', component: StartupView, meta: { fullscreen: true, title: '指挥室' } },
    { path: '/matches', name: 'matches', component: () => import('@/views/MatchesView.vue'), meta: { title: '比赛与盘口' } },
    { path: '/records', name: 'records', component: () => import('@/views/RecordsView.vue'), meta: { title: '预测记录' } },
    { path: '/statistics', name: 'statistics', component: () => import('@/views/StatisticsView.vue'), meta: { title: '效果统计' } },
    { path: '/memory', name: 'memory', component: () => import('@/views/MemoryView.vue'), meta: { title: '长期记忆' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// 每个标签页第一次打开网站时先到启动页；原本要去的地址记下来，进入系统后再前往。
router.beforeEach((to) => {
  if (to.name === 'startup' || hasEntered()) return true
  rememberTarget(to.fullPath)
  return { name: 'startup', replace: true }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · DogHunt` : 'DogHunt · NBA 助手'
})

export default router
