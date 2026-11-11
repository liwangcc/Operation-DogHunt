import type { OddsBoard } from '@/types/odds'

export async function getOdds(refresh = false): Promise<OddsBoard> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), refresh ? 25000 : 5000)
  try {
    const response = await fetch(`/api/v1/odds${refresh ? '/refresh' : ''}`, {
      method: refresh ? 'POST' : 'GET',
      headers: refresh ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      ...(refresh ? { body: '{}' } : {}),
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = await response.json()
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `盘口请求失败（HTTP ${response.status}）`)
    if (!['available', 'empty', 'unavailable'].includes(body.status) || !Array.isArray(body.events)
      || typeof body.stale !== 'boolean' || typeof body.message !== 'string') {
      throw new Error('盘口数据格式异常，请稍后重新读取。')
    }
    return body as OddsBoard
  } catch (error) {
    if (controller.signal.aborted) throw new Error(refresh ? '更新超时，旧数据已保留；服务端可能仍在处理，请先重新读取。' : '读取盘口超时，请确认后端正在运行。')
    if (error instanceof TypeError) throw new Error('无法连接盘口服务，请确认后端正在运行。')
    if (error instanceof SyntaxError) throw new Error('盘口服务未返回有效数据，请确认后端正在运行。')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
