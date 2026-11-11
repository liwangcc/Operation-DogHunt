<script setup lang="ts">
import BackendStatus from '@/components/common/BackendStatus.vue'

const navigation = [
  { to: '/', label: 'NBA 助手', mark: '01' },
  { to: '/matches', label: '比赛与盘口', mark: '02' },
  { to: '/records', label: '预测记录', mark: '03' },
  { to: '/statistics', label: '效果统计', mark: '04' },
  { to: '/memory', label: '长期记忆', mark: '05' },
  { to: '/settings', label: '设置', mark: '06' },
]
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="DogHunt 首页">
        <span class="brand-symbol">D<span>↗</span></span>
        <span>DogHunt<small>NBA RESEARCH</small></span>
      </RouterLink>
      <p class="nav-label">工作空间</p>
      <nav aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-link" exact-active-class="active">
          <span class="nav-mark">{{ item.mark }}</span>{{ item.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-note">
        <span class="small-label">当前阶段</span>
        <strong>比赛与 AI 联动</strong>
        <p>独立查看比赛与盘口。<br />聊天可参考已保存的报价。</p>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span class="workspace-label">OPERATION DOGHUNT</span>
        <div><BackendStatus /></div>
      </header>
      <main id="main-content" tabindex="-1"><slot /></main>
    </div>
  </div>
</template>
