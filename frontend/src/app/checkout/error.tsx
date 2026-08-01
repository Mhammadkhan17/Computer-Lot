"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        There was an error loading the checkout page. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link href="/">Back to catalog</Link>
        </Button>
      </div>
    </div>
  )
}
