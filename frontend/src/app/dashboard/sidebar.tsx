"use client"

import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useDashboard } from "./dashboard-provider"
import { useState } from "react"

const navItems = [
  { section: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { section: "orders" as const, label: "Orders", icon: ShoppingCart },
  { section: "approvals" as const, label: "Approvals", icon: Users },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { activeSection, setActiveSection } = useDashboard()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = activeSection === item.section
        return (
          <button
            key={item.section}
            onClick={() => {
              setActiveSection(item.section)
              onNavigate?.()
            }}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-[#d45113]/10 text-[#d45113]"
                : "text-[#8896a4] hover:bg-[#2a2e34] hover:text-[#e4e7eb]"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export function DashboardSidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 lg:z-30 lg:pt-12">
      <div className="flex flex-col flex-1 gap-4 bg-[#14161a] border-r border-[#2a2e34] px-0 py-6">
        <div className="px-6 pb-4 border-b border-[#2a2e34]">
          <h2 className="font-display text-sm font-semibold text-[#e4e7eb] tracking-wider uppercase">
            Admin Panel
          </h2>
        </div>
        <NavItems />
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-[#8896a4] hover:text-[#e4e7eb]"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-60 bg-[#14161a] border-r border-[#2a2e34] p-0">
        <SheetHeader className="px-6 py-6 border-b border-[#2a2e34]">
          <SheetTitle className="font-display text-sm font-semibold text-[#e4e7eb] tracking-wider uppercase">
            Admin Panel
          </SheetTitle>
        </SheetHeader>
        <div className="pt-4">
          <NavItems onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
