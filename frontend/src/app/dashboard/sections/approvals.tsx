"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface Profile {
  id: string
  full_name: string
  company_name?: string
  tax_registration_id?: string
  role: string
  created_at: string
}

interface ApprovalsSectionProps {
  pendingProfiles: Profile[]
  loading: boolean
}

export function ApprovalsSection({ pendingProfiles, loading }: ApprovalsSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#14161a]">
          Wholesale Approvals
        </h1>
        <p className="mt-1 text-sm text-[#6b7885]">
          Review and manage wholesale account requests.
        </p>
      </div>

      <Card className="border-[#d7dce2] bg-white shadow-none">
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
          <div>
            <CardTitle className="font-display text-base font-semibold text-[#14161a]">
              Pending Requests
            </CardTitle>
          </div>
          {!loading && pendingProfiles.length > 0 && (
            <Badge variant="outline" className="border-[#b8862c] font-mono text-[#b8862c]">
              {pendingProfiles.length}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-[#e4e7eb]" />
              ))}
            </div>
          ) : pendingProfiles.length === 0 ? (
            <p className="text-sm text-[#8896a4]">No pending approval requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Pending wholesale approvals">
                <caption className="sr-only">Pending wholesale approval requests</caption>
                <thead>
                  <tr className="border-b border-[#d7dce2] text-left text-xs font-semibold uppercase tracking-wider text-[#6b7885]">
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
                      className="border-b border-[#e4e7eb] last:border-0"
                    >
                      <td className="py-2 pr-4 text-[#14161a]">
                        {profile.full_name}
                      </td>
                      <td className="py-2 pr-4 text-[#6b7885]">
                        {profile.company_name || "\u2014"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[#6b7885]">
                        {profile.tax_registration_id || "\u2014"}
                      </td>
                      <td className="flex gap-2 py-2">
                        <Button
                          size="sm"
                          className="bg-[#1f4e79] text-white hover:bg-[#1a4063]"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#d7dce2] text-[#6b7885]"
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
