"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/utils/supabase/client"
import { useUserRole, useUserRoleLoaded, useUserRoleStore } from "@/hooks/useUserRole"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const BASE_BUTTON_CLASS =
  "inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90"

export function WholesaleApplyButton() {
  const role = useUserRole()
  const roleLoaded = useUserRoleLoaded()

  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!roleLoaded) {
    return (
      <Button disabled className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </Button>
    )
  }

  if (role === null) {
    return (
      <Link href="/login" className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  const openDialog = () => {
    setError(null)
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setCompanyName("")
    setTaxId("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setError("Not authenticated")
        return
      }
      const res = await fetch(`${API_URL}/wholesale/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          tax_registration_id: taxId.trim() || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.detail || "Application failed")
      }
      toast.success("Wholesale application submitted for review")
      closeDialog()
      useUserRoleStore.getState().fetchRole()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Application failed"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const statusCopy: Record<string, { title: string; body: string }> = {
    wholesale_pending: {
      title: "Application Under Review",
      body: "Your wholesale application is being reviewed. You'll be notified when it's approved.",
    },
    wholesale_approved: {
      title: "You're Already Approved",
      body: "Wholesale pricing is active on your account — no application needed.",
    },
    admin: {
      title: "Admin Account Detected",
      body: "You're browsing as an admin account.",
    },
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {role === "retail" ? "Apply for Wholesale" : statusCopy[role]?.title ?? "Wholesale"}
            </DialogTitle>
          </DialogHeader>

          {role === "retail" ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="wholesale-company" className="text-sm font-medium text-foreground">
                  Company Name <span className="text-muted-foreground">(required)</span>
                </label>
                <Input
                  id="wholesale-company"
                  type="text"
                  placeholder="Your company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  maxLength={255}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="wholesale-tax-id" className="text-sm font-medium text-foreground">
                  Tax Registration ID <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="wholesale-tax-id"
                  type="text"
                  placeholder="Tax ID or VAT number"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  "Submit Application"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {statusCopy[role] && (
                <p className="text-sm text-muted-foreground">{statusCopy[role].body}</p>
              )}
              <Button variant="outline" className="w-full" onClick={closeDialog}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
