import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-surface-dark-border bg-surface-dark">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-white">
              <span className="flex h-7 w-7 items-center justify-center bg-accent">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                  <rect x="8" y="8" width="8" height="8" rx="1" />
                  <circle cx="10" cy="10" r="1" />
                  <circle cx="14" cy="10" r="1" />
                  <circle cx="10" cy="14" r="1" />
                  <circle cx="14" cy="14" r="1" />
                  <path d="M5 9H3" />
                  <path d="M5 15H3" />
                  <path d="M19 9h2" />
                  <path d="M19 15h2" />
                  <path d="M9 5V3" />
                  <path d="M15 5V3" />
                  <path d="M9 19v2" />
                  <path d="M15 19v2" />
                </svg>
              </span>
              LOT LIQUIDATION
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-text-dark-muted max-w-xs">
              Wholesale and retail computer component lots. Every lot inspected,
              graded, and ready to ship.
            </p>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-medium tracking-wider text-white">
              QUICK LINKS
            </h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/" className="text-xs text-text-dark-muted transition-colors hover:text-white">
                  Catalog
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-xs text-text-dark-muted transition-colors hover:text-white">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/#wholesale" className="text-xs text-text-dark-muted transition-colors hover:text-white">
                  Wholesale
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-medium tracking-wider text-white">
              GRADES
            </h4>
            <ul className="mt-3 space-y-2">
              {[
                { label: "Grade A", color: "bg-grade-a" },
                { label: "Grade B", color: "bg-grade-b" },
                { label: "Grade C", color: "bg-grade-c" },
                { label: "For Parts", color: "bg-grade-parts" },
              ].map((g) => (
                <li key={g.label} className="flex items-center gap-2 text-xs text-text-dark-muted">
                  <span className={`flex h-3 w-3 ${g.color}`} />
                  {g.label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-medium tracking-wider text-white">
              CONTACT
            </h4>
            <ul className="mt-3 space-y-2">
              <li className="text-xs text-text-dark-muted">
                Orders placed via WhatsApp
              </li>
              <li className="text-xs text-text-dark-muted">
                Same-day confirmation
              </li>
              <li className="text-xs text-text-dark-muted">
                Warehouse pickup available
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-surface-dark-border pt-6 text-center font-mono text-[11px] text-text-dark-muted">
          &copy; {new Date().getFullYear()} Lot Liquidation. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
