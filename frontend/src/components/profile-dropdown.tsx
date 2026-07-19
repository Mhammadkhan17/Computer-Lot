"use client"

import { UserCircle, LayoutDashboard, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProfileDropdownProps {
  email?: string
  role?: string
  isAdmin: boolean
}

export function ProfileDropdown({ email, role, isAdmin }: ProfileDropdownProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-sm text-[#6b7885] transition-colors hover:text-[#e4e7eb] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d45113] rounded-sm"
          aria-label="Profile menu"
        >
          <UserCircle className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[#14161a]">{email || "User"}</span>
            {role && (
              <span className="text-xs font-normal text-[#6b7885] capitalize">{role.replace("_", " ")}</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onClick={() => router.push("/dashboard")}>
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-[#bf3a2b]"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
