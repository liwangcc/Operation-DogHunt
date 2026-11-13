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

export type StreamEvent = { event: string; data: unknown }

/**
 * POST 并逐个读取后端 SSE 事件（event/data 两行一组）。开始推送前的错误按 HTTP 状态处理，
 * 之后的错误由后端以 error 事件给出。超时从发出请求算起，覆盖整个回答。
 */
export async function postStream(path: string, body: unknown, timeoutMs: number, onEvent: (item: StreamEvent) => void): Promise<void> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: controller.signal,
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null)
      if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
        if (typeof detail.detail === 'string') throw new Error(detail.detail)
        if (response.status === 422) throw new Error('输入或聊天上下文超出限制，请缩短问题或开始新对话。')
      }
      throw new Error(`后端暂不可用（HTTP ${response.status}）`)
    }
    if (!response.body) throw new Error('浏览器不支持逐段读取回答。')
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        let event = 'message'
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
        }
        if (data.length) onEvent({ event, data: JSON.parse(data.join('\n')) })
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('等待回答超时，未自动重试。中转站可能已经计费，请稍后手动重试。')
    if (error instanceof TypeError) throw new Error('与后端的连接中断，本次回答未完成，请手动重试。')
    if (error instanceof SyntaxError) throw new Error('后端推送的数据格式不正确，本次回答未完成。')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
