"use client"

import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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
  { section: "products" as const, label: "Products", icon: Package },
  { section: "approvals" as const, label: "Approvals", icon: Users },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { activeSection, setActiveSection } = useDashboard()

  return (
    <nav className="flex flex-col gap-0.5 px-3">
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
              "relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isActive
                ? "bg-accent/10 text-accent"
                : "text-text-dark-muted hover:bg-white/5 hover:text-white"
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
            )}
            <Icon className="size-4 shrink-0" aria-hidden="true" />
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
      <div className="flex flex-1 flex-col gap-4 border-r border-surface-dark-border bg-surface-dark px-0 py-6">
        <div className="flex items-center gap-3 px-6 pb-4">
          <div className="flex size-7 items-center justify-center rounded-sm bg-accent text-xs font-bold text-accent-foreground">
            C
          </div>
          <h2 className="font-display text-sm font-semibold tracking-wider text-white uppercase">
            Admin
          </h2>
        </div>
        <Separator className="bg-surface-dark-border" />
        <div className="px-3">
          <p className="mb-2 px-3 font-mono text-[10px] font-medium tracking-[0.12em] text-text-dark-muted uppercase">
            Main
          </p>
          <NavItems />
        </div>
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
            className="text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-60 border-r border-surface-dark-border bg-surface-dark p-0">
        <SheetHeader className="flex flex-row items-center gap-3 border-b border-surface-dark-border px-6 py-6">
          <div className="flex size-7 items-center justify-center rounded-sm bg-accent text-xs font-bold text-accent-foreground">
            C
          </div>
          <SheetTitle className="font-display text-sm font-semibold tracking-wider text-white uppercase">
            Admin
          </SheetTitle>
        </SheetHeader>
        <div className="pt-4">
          <NavItems onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
