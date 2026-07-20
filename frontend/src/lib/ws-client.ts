type MessageHandler = (payload: unknown) => void

type WsEvent =
  | "stock_update"
  | "order_status_update"
  | "profile_update"
  | "product_update"

export class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private token: string | null = null
  private backoff = 1000

  connect(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.token = token
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const url = `${protocol}//${window.location.host}/ws?token=${token}`
    this.shouldReconnect = true

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.backoff = 1000
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const { type, payload } = JSON.parse(event.data)
        const handlers = this.handlers.get(type)
        if (handlers) handlers.forEach((fn) => fn(payload))
      } catch {
        /* ignore malformed messages */
      }
    }

    this.ws.onclose = () => {
      if (this.shouldReconnect) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  on(event: WsEvent | string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.token) this.connect(this.token)
      this.backoff = Math.min(this.backoff * 2, 30000)
    }, this.backoff)
  }
}

export const wsClient = new WebSocketClient()
