"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Barcode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [taxRegId, setTaxRegId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"login" | "signup">("login")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    let authRes
    if (mode === "login") {
      authRes = await supabase.auth.signInWithPassword({ email, password })
    } else {
      const meta: Record<string, string> = { full_name: email.split("@")[0] }
      if (companyName) meta.company_name = companyName
      if (taxRegId) meta.tax_registration_id = taxRegId

      authRes = await supabase.auth.signUp({
        email,
        password,
        options: { data: meta },
      })
    }

    if (authRes.error) {
      setError(authRes.error.message)
      setLoading(false)
      return
    }

    router.replace("/")
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm items-center justify-center px-4">
      <div className="w-full">
        <div className="mb-8 text-center">
          <Barcode className="mx-auto h-8 w-8 text-accent" />
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground">
            {mode === "login" ? "Sign In" : "Create Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to your account"
              : "Create an account to start ordering"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-destructive bg-destructive/10 p-3 font-mono text-xs text-destructive" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "signup" && (
            <>
              <div className="space-y-2">
                <label htmlFor="company-name" className="text-sm font-medium text-foreground">
                  Company Name <span className="text-muted-foreground/60">(for wholesale)</span>
                </label>
                <Input
                  id="company-name"
                  type="text"
                  placeholder="Your company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="tax-id" className="text-sm font-medium text-foreground">
                  Tax Registration ID <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <Input
                  id="tax-id"
                  type="text"
                  placeholder="Tax ID or VAT number"
                  value={taxRegId}
                  onChange={(e) => setTaxRegId(e.target.value)}
                />
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={loading}
          >
            {loading ? "Please wait\u2026" : mode === "login" ? "Sign In" : "Create Account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
