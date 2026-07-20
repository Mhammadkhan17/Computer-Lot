import Link from "next/link"
import { Barcode, ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-surface-dark">
      <div className="mx-auto max-w-lg px-4 text-center">
        <div className="mb-6 flex justify-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-grade-a font-mono text-[11px] font-bold text-white">
            A
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-grade-b font-mono text-[11px] font-bold text-white">
            B
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-grade-c font-mono text-[11px] font-bold text-white">
            C
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-grade-parts font-mono text-[11px] font-bold text-white">
            FP
          </span>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-xs font-medium tracking-[0.15em] text-accent">
          <span className="h-px w-5 bg-accent" />
          PAGE NOT FOUND
          <span className="h-px w-5 bg-accent" />
        </div>

        <h1 className="font-display text-7xl font-bold tracking-tight text-white md:text-8xl">
          404
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-text-dark-muted">
          This lot doesn&apos;t exist. The page you&apos;re looking for
          might have been removed, renamed, or is temporarily unavailable.
        </p>

        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="h-px w-12 bg-surface-dark-border" />
          <Barcode className="h-4 w-4" />
          <span className="h-px w-12 bg-surface-dark-border" />
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Link>
      </div>
    </main>
  )
}
