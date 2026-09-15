"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface SourcingRequest {
  id: string
  user_id: string | null
  user_email: string | null
  phone: string | null
  listing_url: string
  title: string
  current_bid: number | null
  msrp: number | null
  pallet_count: number | null
  unit_count: number | null
  source_retailer: string | null
  condition: string | null
  location: string | null
  quantity_requested: number
  notes: string
  status: string
  created_at: string
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const statusVariant: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  pending: "outline",
  contacted: "secondary",
  declined: "destructive",
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function SourcingSection() {
  const router = useRouter()
  const [requests, setRequests] = useState<SourcingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error("Session expired. Please sign in again.")
        router.push("/login")
        return
      }
      const params = statusFilter ? `?status=${statusFilter}` : ""
      const res = await fetch(`${API_URL}/admin/explore/requests${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.status === 401 || res.status === 403) {
        toast.error("Session expired. Please sign in again.")
        router.push("/login")
        return
      }
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setRequests(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load sourcing requests")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, router])

  useEffect(() => { refresh() }, [refresh])

  const handleStatusChange = async (requestId: string, newStatus: string) => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${API_URL}/admin/explore/requests/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error("Failed to update status")
      toast.success(`Request marked as ${newStatus}`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status")
    }
  }

  const sorted = [...requests].sort((a, b) => {
    const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return sortAsc ? d : -d
  })

  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Sourcing Requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and manage B-Stock lot sourcing requests from users.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {["", "pending", "contacted", "declined"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            className={statusFilter === s ? "bg-accent text-accent-foreground" : "border-border text-muted-foreground"}
            onClick={() => setStatusFilter(s)}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
            {s === "pending" && pendingCount > 0 && (
              <Badge variant="outline" className="ml-1.5 border-grade-b font-mono text-grade-b text-[10px]">
                {pendingCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-foreground">
            Requests
          </CardTitle>
          <Badge variant="outline" className="font-mono text-muted-foreground">
            {requests.length}
          </Badge>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sourcing requests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Sourcing requests">
                <caption className="sr-only">Sourcing requests list</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-2 w-8"></th>
                    <th className="pb-2 pr-4">Title</th>
                    <th className="pb-2 pr-4">User</th>
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2 pr-4">Bid / MSRP</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Qty</th>
                    <th className="pb-2">
                      <button
                        onClick={() => setSortAsc(!sortAsc)}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        Date
                        <span className="text-[10px]">{sortAsc ? "\u2191" : "\u2193"}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((req) => (
                    <tr key={req.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={expandedId === req.id ? "Collapse details" : "Expand details"}
                        >
                          {expandedId === req.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 pr-4 max-w-[250px]">
                        <p className="truncate text-foreground font-medium">{req.title}</p>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                        {req.user_email || req.user_id?.slice(0, 8) + "\u2026" || "\u2014"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {req.source_retailer || "\u2014"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">
                        {req.current_bid != null ? currencyFormat.format(req.current_bid) : "\u2014"}
                        {req.msrp != null && ` / ${currencyFormat.format(req.msrp)}`}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className="rounded border border-border bg-transparent px-2 py-1 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="pending">Pending</option>
                          <option value="contacted">Contacted</option>
                          <option value="declined">Declined</option>
                        </select>
                      </td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">
                        {req.quantity_requested}
                      </td>
                      <td className="py-2 font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expandedId && (() => {
            const req = requests.find((r) => r.id === expandedId)
            if (!req) return null
            return (
              <div className="mt-4 rounded-sm border border-border bg-muted/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Request Details</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">User: </span>
                    <span className="text-foreground">{req.user_email || req.user_id || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone: </span>
                    <span className="text-foreground">{req.phone || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Listing URL: </span>
                    <a
                      href={req.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      View on B-Stock
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Qty Requested: </span>
                    <span className="text-foreground">{req.quantity_requested}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Condition: </span>
                    <span className="text-foreground">{req.condition || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location: </span>
                    <span className="text-foreground">{req.location || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pallet Count: </span>
                    <span className="text-foreground">{req.pallet_count ?? "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unit Count: </span>
                    <span className="text-foreground">{req.unit_count ?? "\u2014"}</span>
                  </div>
                  {req.notes && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Notes: </span>
                      <span className="text-foreground">{req.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
