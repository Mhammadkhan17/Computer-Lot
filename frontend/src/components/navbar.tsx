"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ShoppingCart, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/useCart"
import { createClient } from "@/utils/supabase/client"
import { ProfileDropdown } from "@/components/profile-dropdown"

export function Navbar() {
  const totalItems = useCart((s) => s.totalItems())
  const setCartOpen = useCart((s) => s.setCartOpen)
  const [user, setUser] = useState<{ id: string; email?: string; role?: string } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        const role = (authUser.app_metadata?.role as string) ?? undefined
        setUser({ id: authUser.id, email: authUser.email, role })
      }
    })
  }, [])

  const isAdmin = user?.role === "admin"

  return (
    <header className="sticky top-0 z-50 border-b border-surface-dark-border bg-surface-dark text-muted-foreground">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center bg-accent">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
              <circle cx="10" cy="10" r="1" />
              <circle cx="14" cy="10" r="1" />
              <circle cx="10" cy="14" r="1" />
              <circle cx="14" cy="14" r="1" />
              <path d="M5 9H3" />
              <path d="M5 15H3" />
              <path d="M19 9h2" />
              <path d="M19 15h2" />
              <path d="M9 5V3" />
              <path d="M15 5V3" />
              <path d="M9 19v2" />
              <path d="M15 19v2" />
            </svg>
          </span>
          <span>LOT&nbsp;LIQUIDATION</span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  asChild
                >
                  <Link href="/dashboard" aria-label="Dashboard">
                    <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              <ProfileDropdown email={user.email} role={user.role} isAdmin={isAdmin} />
            </>
          ) : (
            <Link
              href="/login"
              className="flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Sign In
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:bg-white/5 hover:text-foreground"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {mounted && totalItems > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center bg-accent text-[10px] font-bold text-accent-foreground">
                {totalItems}
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  )
}
