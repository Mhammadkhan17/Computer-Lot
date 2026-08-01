"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

type TableEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

interface TableSubscription {
  table: string
  event: TableEvent
}

const subscriptionMap: Record<string, TableSubscription> = {
  order_status_update: { table: "orders", event: "*" },
  profile_update: { table: "profiles", event: "*" },
  product_update: { table: "products", event: "*" },
  stock_update: { table: "products", event: "UPDATE" },
}

export function useWebSocket(event: string, handler: (payload: unknown) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const sub = subscriptionMap[event]
    if (!sub) return

    const supabase = createClient()
    const channel = supabase
      .channel(`realtime-${event}`)
      .on(
        "postgres_changes",
        { event: sub.event, schema: "public", table: sub.table },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          handlerRef.current(payload)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [event])
}
