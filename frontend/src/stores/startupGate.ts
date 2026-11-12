// 启动页的放行记录：本标签页是否已经进入过系统，以及进入后要去的地址。
const STORAGE_KEY = 'doghunt:startup-entered'

// 浏览器禁用存储时退回到内存，至少保证本次打开期间不重复出现启动页。
let enteredInMemory = false
let pendingTarget = '/'

export function hasEntered(): boolean {
  if (enteredInMemory) return true
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markEntered(): void {
  enteredInMemory = true
  try {
    window.sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // 存储不可用时只保留内存标记。
  }
}

/** 跳转失败时撤回放行，用户仍停留在启动页。 */
export function unmarkEntered(): void {
  enteredInMemory = false
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上。
  }
}

/** 记住用户原本想打开的页面，例如直接访问 /matches。 */
export function rememberTarget(fullPath: string): void {
  pendingTarget = fullPath
}

export function enterTarget(): string {
  return pendingTarget
}
