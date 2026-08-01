import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/middleware"

const PROTECTED_PREFIXES = ["/dashboard", "/receipts"]

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = await createClient(request)
  const { pathname } = request.nextUrl

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirected", "1")
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
