import { ArrowDown } from "lucide-react"
import type { Product, ItemGrade } from "@/types"

const gradeMeta: Record<ItemGrade, { label: string }> = {
  Grade_A: { label: "A" },
  Grade_B: { label: "B" },
  Grade_C: { label: "C" },
  For_Parts: { label: "FP" },
}

const gradeColors: Record<ItemGrade, string> = {
  Grade_A: "bg-grade-a",
  Grade_B: "bg-grade-b",
  Grade_C: "bg-grade-c",
  For_Parts: "bg-grade-parts",
}

const gradeNames: Record<ItemGrade, string> = {
  Grade_A: "Grade A",
  Grade_B: "Grade B",
  Grade_C: "Grade C",
  For_Parts: "For Parts",
}

interface HeroProps {
  products: Product[]
}

export function HeroSection({ products }: HeroProps) {
  const totalLots = products.reduce((s, p) => s + p.available_stock_lots, 0)

  const gradeCounts = {
    Grade_A: products.filter((p) => p.grade === "Grade_A").length,
    Grade_B: products.filter((p) => p.grade === "Grade_B").length,
    Grade_C: products.filter((p) => p.grade === "Grade_C").length,
    For_Parts: products.filter((p) => p.grade === "For_Parts").length,
  }

  const activeGrades = (Object.keys(gradeCounts) as ItemGrade[]).filter(
    (k) => gradeCounts[k] > 0
  )

  return (
    <section className="relative border-b border-surface-dark-border bg-surface-dark overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:48px_48px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-end">
          <div>
            <div className="mb-4 flex items-center gap-3 font-mono text-xs font-medium tracking-[0.15em] text-accent">
              <span className="h-px w-6 bg-accent" />
              INVENTORY AUCTION
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl text-pretty">
              Computer{" "}
              <span className="text-accent">Lots</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-text-dark-muted md:text-base">
              Wholesale and retail computer component lots.
              Every lot is inspected, graded, and ready to ship
              from our warehouse. No minimums on retail orders.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#catalog"
                className="inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90"
              >
                Browse Catalog
                <ArrowDown className="h-4 w-4" />
              </a>
              <a
                href="#wholesale"
                className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Wholesale Pricing
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div>
              <div className="font-mono text-3xl font-bold tracking-tight text-white md:text-4xl">
                {totalLots}
              </div>
              <div className="mt-1 font-mono text-[11px] font-medium tracking-wider text-text-dark-muted">
                TOTAL LOTS
              </div>
            </div>
            <div>
              <div className="font-mono text-3xl font-bold tracking-tight text-white md:text-4xl">
                {products.length}
              </div>
              <div className="mt-1 font-mono text-[11px] font-medium tracking-wider text-text-dark-muted">
                PRODUCTS
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-2">
          {activeGrades.map((grade) => (
            <div
              key={grade}
              className="flex items-center gap-2 border border-surface-dark-border px-3 py-1.5"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center font-mono text-[10px] font-bold text-white ${gradeColors[grade]}`}
              >
                {gradeMeta[grade].label}
              </span>
              <span className="font-mono text-sm font-medium text-white">
                {gradeCounts[grade]}
              </span>
              <span className="font-mono text-[11px] text-text-dark-muted">
                {gradeNames[grade]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
