"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { RefreshCcw } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ExploreCard } from "@/components/explore-card"
import { SearchBar } from "@/components/search-bar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/utils/supabase/client"

interface ExploreListing {
  lot_id: string
  title: string
  auction_url: string
  current_bid: number | null
  msrp: number | null
  currency: string
  pallet_count: number | null
  unit_count: number | null
  condition: string | null
  source_retailer: string | null
  location: string | null
  close_time: string | null
  image_url: string | null
  number_of_bids: number | null
  inventory_type: string | null
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden border border-border bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ExplorePage() {
  const router = useRouter()
  const [listings, setListings] = useState<ExploreListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [user, setUser] = useState<{ id: string } | null>(null)

  const [requestModal, setRequestModal] = useState<ExploreListing | null>(null)
  const [requestQty, setRequestQty] = useState(1)
  const [requestNotes, setRequestNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id })
    })
  }, [])

  const fetchListings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/explore/listings?max_results=200`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Failed to fetch")
      setListings(data.listings || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchListings() }, [fetchListings])

  const filtered = useMemo(
    () => {
      if (!search) return listings
      const q = search.toLowerCase()
      return listings.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.source_retailer && l.source_retailer.toLowerCase().includes(q))
      )
    },
    [listings, search]
  )

  const handleRequest = (listing: ExploreListing) => {
    if (!user) {
      router.push("/login?redirect=/explore")
      return
    }
    setRequestModal(listing)
    setRequestQty(1)
    setRequestNotes("")
  }

  const submitRequest = async () => {
    if (!requestModal || !user) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login?redirect=/explore")
        return
      }
      const res = await fetch(`${API_URL}/explore/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          listing_url: requestModal.auction_url,
          title: requestModal.title,
          current_bid: requestModal.current_bid,
          msrp: requestModal.msrp,
          pallet_count: requestModal.pallet_count,
          unit_count: requestModal.unit_count,
          source_retailer: requestModal.source_retailer,
          condition: requestModal.condition,
          location: requestModal.location,
          quantity_requested: requestQty,
          notes: requestNotes,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Request failed")
      }
      toast.success("Request submitted! Admin will review and contact you.")
      setRequestModal(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Explore B-Stock Listings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live computer hardware liquidation auctions from Amazon, Walmart, Target &amp; more
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <SearchBar onSearch={setSearch} />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="border-border text-muted-foreground shrink-0"
            onClick={fetchListings}
            disabled={loading}
            aria-label="Refresh listings"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-destructive bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
          {error}
          <button
            onClick={fetchListings}
            className="ml-2 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">
            {search ? "No listings match your search." : "No computer hardware listings available right now."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((listing) => (
            <ExploreCard
              key={listing.lot_id}
              listing={listing}
              onRequest={handleRequest}
              isAuthenticated={!!user}
            />
          ))}
        </div>
      )}

      <Dialog open={!!requestModal} onOpenChange={(open) => !open && setRequestModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Lot</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Submit a sourcing request for this lot. Admin will review and contact you.
            </p>
          </DialogHeader>
          {requestModal && (
            <div className="space-y-4">
              <div className="rounded-sm bg-muted p-3">
                <p className="text-sm font-medium text-foreground line-clamp-2">
                  {requestModal.title}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {requestModal.current_bid != null && `${currencyFormat.format(requestModal.current_bid)}`}
                  {requestModal.msrp != null && ` / ${currencyFormat.format(requestModal.msrp)} MSRP`}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={requestQty}
                  onChange={(e) => setRequestQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any specific requirements or questions..."
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={submitting}
                onClick={submitRequest}
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
