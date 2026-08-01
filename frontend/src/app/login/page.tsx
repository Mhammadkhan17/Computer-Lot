"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Barcode, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [taxRegId, setTaxRegId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [mode, setMode] = useState<"login" | "signup">("login")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSignupSuccess(false)

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

    if (mode === "signup" && authRes.data.user?.identities?.length === 0) {
      setSignupSuccess(true)
      setLoading(false)
      return
    }

    router.replace("/")
  }

  return (
    <div className="relative min-h-dvh border-b border-surface-dark-border bg-surface-dark overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:48px_48px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />

      <div className="relative mx-auto flex min-h-dvh max-w-sm items-center justify-center px-4 py-16">
        <div className="w-full">
          <div className="mb-8 text-center">
            <Barcode className="mx-auto h-8 w-8 text-accent" />
            <h1 className="mt-3 font-display text-2xl font-bold text-white">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h1>
            <p className="mt-1 text-sm text-text-dark-muted">
              {mode === "login"
                ? "Sign in to your account"
                : "Create an account to start ordering"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert" aria-live="assertive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {signupSuccess && (
              <div className="border border-grade-a/50 bg-grade-a/10 p-3 text-sm text-grade-a" role="alert" aria-live="polite">
                Account created! Check your email to confirm before signing in.
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-white">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-accent focus-visible:ring-accent"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-white">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/30 focus-visible:border-accent focus-visible:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 transition-colors hover:text-white/70"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <label htmlFor="company-name" className="text-sm font-medium text-white">
                    Company Name <span className="text-white/30">(for wholesale)</span>
                  </label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="Your company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-accent focus-visible:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="tax-id" className="text-sm font-medium text-white">
                    Tax Registration ID <span className="text-white/30">(optional)</span>
                  </label>
                  <Input
                    id="tax-id"
                    type="text"
                    placeholder="Tax ID or VAT number"
                    value={taxRegId}
                    onChange={(e) => setTaxRegId(e.target.value)}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-accent focus-visible:ring-accent"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "Signing in\u2026" : "Creating account\u2026"}
                </span>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </Button>

            <p className="text-center text-sm text-text-dark-muted">
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    className="font-medium text-accent transition-colors hover:text-accent/80"
                    onClick={() => { setMode("signup"); setError(null); setSignupSuccess(false) }}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-medium text-accent transition-colors hover:text-accent/80"
                    onClick={() => { setMode("login"); setError(null); setSignupSuccess(false) }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}