"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ShoppingCart, Barcode, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/useCart"
import { createClient } from "@/utils/supabase/client"
import { ProfileDropdown } from "@/components/profile-dropdown"

export function Navbar() {
  const totalItems = useCart((s) => s.totalItems())
  const [user, setUser] = useState<{ id: string; email?: string; role?: string } | null>(null)

  useEffect(() => {
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
    <header className="sticky top-0 z-50 border-b border-[#2a2e34] bg-[#14161a] text-[#e4e7eb]">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center bg-[#d45113]">
            <Barcode className="h-4 w-4 text-white" aria-hidden="true" />
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
                  className="text-[#6b7885] hover:bg-[#1e2126] hover:text-[#e4e7eb]"
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
              className="flex items-center gap-1.5 text-sm text-[#6b7885] transition-colors hover:text-[#e4e7eb] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d45113] rounded-sm px-1"
            >
              Sign In
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="relative text-[#6b7885] hover:bg-[#1e2126] hover:text-[#e4e7eb]"
            asChild
          >
            <Link href="/?cart=open" aria-label="Open cart">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {totalItems > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center bg-[#d45113] text-[10px] font-bold text-white">
                  {totalItems}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
