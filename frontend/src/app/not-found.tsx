import Link from "next/link"
import { Barcode, ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-[#14161a]">
      <div className="mx-auto max-w-lg px-4 text-center">
        <div className="mb-6 flex justify-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-[#45845f] font-mono text-[11px] font-bold text-white">
            A
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-[#b8862c] font-mono text-[11px] font-bold text-white">
            B
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-[#c95d2b] font-mono text-[11px] font-bold text-white">
            C
          </span>
          <span className="flex h-8 w-8 items-center justify-center bg-[#6b4c8a] font-mono text-[11px] font-bold text-white">
            FP
          </span>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-xs font-medium tracking-[0.15em] text-[#d45113]">
          <span className="h-px w-5 bg-[#d45113]" />
          PAGE NOT FOUND
          <span className="h-px w-5 bg-[#d45113]" />
        </div>

        <h1 className="font-display text-7xl font-bold tracking-tight text-white md:text-8xl">
          404
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-[#8896a4]">
          This lot doesn&apos;t exist. The page you&apos;re looking for
          might have been removed, renamed, or is temporarily unavailable.
        </p>

        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#6b7885]">
          <span className="h-px w-12 bg-[#2a2e34]" />
          <Barcode className="h-4 w-4" />
          <span className="h-px w-12 bg-[#2a2e34]" />
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 bg-[#d45113] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#bf4610]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Link>
      </div>
    </main>
  )
}
