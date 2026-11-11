export interface HealthResponse {
  status: 'ok'
  app: string
  environment: 'development' | 'test' | 'production'
  version: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ModelStatus {
  configured: boolean
  model: string | null
  timeout_seconds: number
}

export interface ChatResponse {
  reply: string
  model: string
  usage?: { input_tokens: number; output_tokens: number } | null
}
