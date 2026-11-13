<script setup lang="ts">
// 侧边抽屉：从右侧滑出的详情面板。打开时把焦点关在面板里，Esc 或点击遮罩关闭，关闭后把焦点还给原来的按钮。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ label: string; wide?: boolean }>()

const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

function focusable(): HTMLElement[] {
  return Array.from(panel.value?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
}

/** Tab 走到头时绕回另一头，不让焦点落到遮罩后面的页面上。 */
function onTab(event: KeyboardEvent): void {
  const items = focusable()
  if (!items.length) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function lockScroll(locked: boolean): void {
  document.documentElement.style.overflow = locked ? 'hidden' : ''
}

watch(open, async (value) => {
  lockScroll(value)
  if (value) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    panel.value?.focus()
  } else {
    returnFocus?.focus()
    returnFocus = null
  }
}, { immediate: true })

onBeforeUnmount(() => lockScroll(false))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-layer" @mousedown.self="open = false">
        <section ref="panel" class="drawer" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1" @keydown.esc.stop="open = false" @keydown.tab="onTab">
          <header class="drawer-head">
            <div class="drawer-title"><slot name="title" /></div>
            <button type="button" class="icon-btn" aria-label="关闭" @click="open = false">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </header>
          <div class="drawer-body"><slot /></div>
          <footer v-if="$slots.footer" class="drawer-foot"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-layer { position: fixed; inset: 0; z-index: 70; display: flex; justify-content: flex-end; background: rgba(2, 4, 6, .66); }
.drawer { display: flex; flex-direction: column; width: 560px; max-width: 100%; height: 100%; border-left: 1px solid var(--line-2); background: var(--panel-solid); box-shadow: -24px 0 60px rgba(0, 0, 0, .5); outline: 0; }
.drawer.wide { width: 680px; }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 22px 18px 26px; border-bottom: 1px solid var(--line); }
.drawer-title { min-width: 0; }
.drawer-body { flex: 1; min-height: 0; padding: 22px 26px 28px; overflow-y: auto; }
.drawer-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 26px calc(14px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); background: var(--bg-0); }

.drawer-enter-active { transition: opacity .18s ease; }
.drawer-enter-active .drawer { transition: transform .24s var(--ease-out); }
.drawer-leave-active { transition: opacity .14s ease; }
.drawer-leave-active .drawer { transition: transform .14s ease-in; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer, .drawer-leave-to .drawer { transform: translateX(24px); }
@media (max-width: 700px) {
  .drawer-head { padding: 18px 14px 14px 18px; }
  .drawer-body { padding: 18px 18px 24px; }
  .drawer-foot { padding-left: 18px; padding-right: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: none; }
}
</style>
