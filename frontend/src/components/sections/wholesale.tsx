import { PackageCheck } from "lucide-react"
import Link from "next/link"
import { WholesaleApplyButton } from "@/components/sections/wholesale-apply-button"

export function WholesaleSection() {
  return (
    <section id="wholesale" className="border-b border-surface-dark-border bg-surface-dark relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,81,19,0.08),transparent_50%)] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center bg-accent/10">
              <PackageCheck className="h-6 w-6 text-accent" aria-hidden="true" />
            </div>
          </div>
          <div className="mb-3 font-mono text-xs font-medium tracking-[0.15em] text-accent">
            WHOLESALE PROGRAM
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Buy in Bulk, Save Big
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-dark-muted md:text-base">
            Wholesale-approved customers get discounted pricing across our entire
            catalog. The more lots you buy, the more you save.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="border border-surface-dark-border p-5">
              <div className="font-mono text-2xl font-bold text-white">10+</div>
              <div className="mt-1 text-xs text-text-dark-muted">
                Minimum lots for wholesale pricing
              </div>
            </div>
            <div className="border border-surface-dark-border p-5">
              <div className="font-mono text-2xl font-bold text-white">Auto</div>
              <div className="mt-1 text-xs text-text-dark-muted">
                Pricing applies automatically at checkout
              </div>
            </div>
            <div className="border border-surface-dark-border p-5">
              <div className="font-mono text-2xl font-bold text-white">Free</div>
              <div className="mt-1 text-xs text-text-dark-muted">
                No membership fees to join
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <WholesaleApplyButton />
            <Link
              href="/#catalog"
              className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
