import { getJson } from './client'
import type { HealthResponse } from '@/types/api'

export async function getHealth(): Promise<HealthResponse> {
  const result = await getJson('/health')
  if (
    typeof result !== 'object' || result === null ||
    !('status' in result) || result.status !== 'ok' ||
    !('app' in result) || typeof result.app !== 'string' ||
    !('version' in result) || typeof result.version !== 'string' ||
    !('environment' in result) ||
    !['development', 'test', 'production'].includes(String(result.environment))
  ) {
    throw new Error('后端响应格式不符合预期，请检查接口地址。')
  }
  return result as HealthResponse
}
