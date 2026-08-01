"use client"

import { useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { AdminProfile } from "@/types"

interface ApprovalsSectionProps {
  pendingProfiles: AdminProfile[]
  loading: boolean
  onAction?: () => void
}

export function ApprovalsSection({ pendingProfiles, loading, onAction }: ApprovalsSectionProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const handleAction = async (profileId: string, action: "approve" | "reject") => {
    setActionLoading(profileId)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Not authenticated")
        return
      }

      const res = await fetch(`${API_URL}/admin/profiles/${profileId}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Action failed")
      }
      toast.success(action === "approve" ? "Wholesale request approved" : "Wholesale request rejected")
      onAction?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Action failed"
      setError(msg)
      toast.error(msg)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Wholesale Approvals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and manage wholesale account requests.
        </p>
      </div>

      {error && (
        <div className="border border-destructive bg-destructive/10 p-3 font-mono text-xs text-destructive" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
          <div>
            <CardTitle className="font-display text-base font-semibold text-foreground">
              Pending Requests
            </CardTitle>
          </div>
          {!loading && pendingProfiles.length > 0 && (
            <Badge variant="outline" className="border-grade-b font-mono text-grade-b">
              {pendingProfiles.length}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : pendingProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending approval requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Pending wholesale approvals">
                <caption className="sr-only">Pending wholesale approval requests</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Company</th>
                    <th className="pb-2 pr-4">Tax ID</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingProfiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-4 text-foreground">
                        {profile.full_name}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {profile.company_name || "\u2014"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">
                        {profile.tax_registration_id || "\u2014"}
                      </td>
                      <td className="flex gap-2 py-2">
                        <Button
                          size="sm"
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                          disabled={actionLoading === profile.id}
                          onClick={() => handleAction(profile.id, "approve")}
                        >
                          {actionLoading === profile.id ? "\u2026" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border text-muted-foreground"
                          disabled={actionLoading === profile.id}
                          onClick={() => handleAction(profile.id, "reject")}
                        >
                          Reject
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
