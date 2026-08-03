"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { createClient } from "@/utils/supabase/client"
import type { UserRole } from "@/types"

interface UserRoleState {
  role: UserRole | null
  loaded: boolean
  setRole: (role: UserRole | null) => void
  fetchRole: () => Promise<UserRole | null>
}

export const useUserRoleStore = create<UserRoleState>((set) => ({
  role: null,
  loaded: false,
  setRole: (role) => set({ role, loaded: true }),
  fetchRole: async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ role: null, loaded: true })
      return null
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    const role = (profile?.role as UserRole) ?? "retail"
    set({ role, loaded: true })
    return role
  },
}))

export function useUserRole(): UserRole | null {
  const role = useUserRoleStore((s) => s.role)

  useEffect(() => {
    const supabase = createClient()
    const refresh = () => {
      useUserRoleStore.getState().fetchRole()
    }
    refresh()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(refresh)
    return () => subscription.unsubscribe()
  }, [])

  return role
}
