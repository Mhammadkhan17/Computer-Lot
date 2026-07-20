import type { Metadata } from "next"
import { Suspense } from "react"
import { createClient } from "@/utils/supabase/server"
import { HeroSection } from "@/components/sections/hero"
import { HowItWorks } from "@/components/sections/how-it-works"
import { FeaturesSection } from "@/components/sections/features"
import { WholesaleSection } from "@/components/sections/wholesale"
import { SiteFooter } from "@/components/site-footer"
import { CatalogGrid } from "./catalog-grid"

export const metadata: Metadata = {
  title: "Lot Liquidation — Computer Component Lots",
  icons: [{ rel: "icon", url: "/favicon-orange.svg", type: "image/svg+xml" }],
}

export default async function Home() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })

  const all = products || []

  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = user?.app_metadata?.role === "admin"

  return (
    <main id="main-content">
      <HeroSection products={all} />

      <HowItWorks />

      <FeaturesSection />

      <section id="catalog" className="mx-auto max-w-7xl px-4 py-16 md:py-20">
        <div className="mb-8">
          <div className="font-mono text-xs font-medium tracking-[0.15em] text-accent">
            CATALOG
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Available Lots
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length} product{all.length !== 1 ? "s" : ""} across{" "}
            {new Set(all.map((p) => p.grade)).size} grade levels
          </p>
        </div>
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse bg-muted" />
              ))}
            </div>
          }
        >
          <CatalogGrid products={all} isAdmin={isAdmin} />
        </Suspense>
      </section>

      <WholesaleSection />

      <SiteFooter />
    </main>
  )
}
