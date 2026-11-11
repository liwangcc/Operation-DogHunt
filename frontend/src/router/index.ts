import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'chat', component: ChatView },
    { path: '/matches', name: 'matches', component: () => import('@/views/MatchesView.vue') },
    { path: '/records', name: 'records', component: () => import('@/views/RecordsView.vue') },
    { path: '/statistics', name: 'statistics', component: () => import('@/views/StatisticsView.vue') },
    { path: '/memory', name: 'memory', component: () => import('@/views/MemoryView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
