/** 所有前端 HTTP 请求集中在这里；不读取任何后端密钥。 */
export async function getJson(path: string): Promise<unknown> {
  return requestJson(path)
}

export async function postJson(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  return requestJson(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs)
}

async function requestJson(path: string, options: RequestInit = {}, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        if (typeof body.detail === 'string') throw new Error(body.detail)
        if (response.status === 422) throw new Error('输入或聊天上下文超出限制，请缩短问题或开始新对话。')
      }
      throw new Error(`后端暂不可用（HTTP ${response.status}）`)
    }
    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(options.method === 'POST' ? '等待回答超时，未自动重试。中转站可能已经计费，请稍后手动重试。' : '连接后端超时，请确认后端正在运行。')
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接后端，请确认后端正在运行。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
