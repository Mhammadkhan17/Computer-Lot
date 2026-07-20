"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import { wsClient } from "@/lib/ws-client"

type WsEvent =
  | "stock_update"
  | "order_status_update"
  | "profile_update"
  | "product_update"

export function useWebSocket(event: WsEvent | string, handler: (payload: unknown) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const supabase = createClient()

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        wsClient.connect(data.session.access_token)
      }
    }
    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        wsClient.connect(session.access_token)
      }
    })

    const unsub = wsClient.on(event, (payload) => handlerRef.current(payload))

    return () => {
      unsub()
      subscription.unsubscribe()
    }
  }, [event])
}
