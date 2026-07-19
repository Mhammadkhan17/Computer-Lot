import { Suspense } from "react"
import { createClient } from "@/utils/supabase/server"
import { CatalogGrid } from "./catalog-grid"

const gradeMeta = {
  Grade_A: { label: "A", color: "bg-[#45845f]", textColor: "text-[#45845f]" },
  Grade_B: { label: "B", color: "bg-[#b8862c]", textColor: "text-[#b8862c]" },
  Grade_C: { label: "C", color: "bg-[#c95d2b]", textColor: "text-[#c95d2b]" },
  For_Parts: { label: "FP", color: "bg-[#6b4c8a]", textColor: "text-[#6b4c8a]" },
} as const

export default async function Home() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })

  const all = products || []
  const totalLots = all.reduce((s, p) => s + p.available_stock_lots, 0)

  const gradeCounts = {
    Grade_A: all.filter((p) => p.grade === "Grade_A").length,
    Grade_B: all.filter((p) => p.grade === "Grade_B").length,
    Grade_C: all.filter((p) => p.grade === "Grade_C").length,
    For_Parts: all.filter((p) => p.grade === "For_Parts").length,
  }

  const activeGrades = (Object.keys(gradeCounts) as (keyof typeof gradeCounts)[]).filter(
    (k) => gradeCounts[k] > 0
  )

  return (
    <main>
      <section className="border-b border-[#2a2e34] bg-[#14161a]">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs font-medium tracking-[0.15em] text-[#d45113]">
                <span className="h-px w-5 bg-[#d45113]" />
                INVENTORY
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                Computer Lots
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#8896a4]">
                Wholesale and retail computer component lots. Every lot is inspected,
                graded, and ready to ship from our warehouse.
              </p>
            </div>
            <div className="flex items-end gap-8 md:gap-12">
              <div className="text-right">
                <div className="font-mono text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {totalLots}
                </div>
                <div className="mt-0.5 text-[11px] font-medium tracking-wider text-[#6b7885]">
                  TOTAL LOTS
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {all.length}
                </div>
                <div className="mt-0.5 text-[11px] font-medium tracking-wider text-[#6b7885]">
                  PRODUCTS
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {activeGrades.map((grade) => (
              <div
                key={grade}
                className="flex items-center gap-2 border border-[#2a2e34] px-3 py-1.5"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center font-mono text-[10px] font-bold text-white ${gradeMeta[grade].color}`}
                >
                  {gradeMeta[grade].label}
                </span>
                <span className="font-mono text-sm font-medium text-white">
                  {gradeCounts[grade]}
                </span>
                <span className="text-[11px] text-[#6b7885]">
                  {grade === "Grade_A"
                    ? "Grade A"
                    : grade === "Grade_B"
                      ? "Grade B"
                      : grade === "Grade_C"
                        ? "Grade C"
                        : "For Parts"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <Suspense fallback={<div className="h-96 animate-pulse bg-[#e4e7eb]" />}>
          <CatalogGrid products={all} />
        </Suspense>
      </section>
    </main>
  )
}
