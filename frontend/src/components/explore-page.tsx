"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { ExternalLink, ImageOff, RefreshCcw, Search, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ExploreCard } from "@/components/explore-card"
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
  const [inputValue, setInputValue] = useState("")
  const [lastSearch, setLastSearch] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [detailListing, setDetailListing] = useState<ExploreListing | null>(null)
  const [requestModal, setRequestModal] = useState<ExploreListing | null>(null)
  const [requestQty, setRequestQty] = useState(1)
  const [requestNotes, setRequestNotes] = useState("")
  const [requestPhone, setRequestPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [signInModal, setSignInModal] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id })
    })
  }, [])

  const fetchListings = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = query ? `?search=${encodeURIComponent(query)}&max_results=200` : "?max_results=200"
      const res = await fetch(`${API_URL}/explore/listings${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Failed to fetch")
      if (data.error) throw new Error(data.error)
      setListings(data.listings || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchListings("") }, [fetchListings])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setLastSearch(inputValue)
    fetchListings(inputValue)
  }, [inputValue, fetchListings])

  const handleClear = useCallback(() => {
    setInputValue("")
    setLastSearch(null)
    fetchListings("")
    inputRef.current?.focus()
  }, [fetchListings])

  const handleRefresh = useCallback(() => {
    fetchListings(lastSearch || "")
  }, [lastSearch, fetchListings])

  const handleDetail = useCallback((listing: ExploreListing) => {
    setDetailListing(listing)
  }, [])

  const handleRequest = (listing: ExploreListing) => {
    if (!user) {
      setSignInModal(true)
      return
    }
    setRequestModal(listing)
    setRequestQty(1)
    setRequestNotes("")
    setRequestPhone("")
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
          phone: requestPhone,
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
            Live liquidation auctions across electronics, cell phones, office equipment &amp; mixed lots from Amazon, Walmart, Target &amp; more
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="Search by brand, model, or keyword..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="pl-9 pr-8"
            />
            {inputValue && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={loading || !inputValue.trim()}>
            Search
          </Button>
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="border-border text-muted-foreground shrink-0"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh listings"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </form>
      </div>

      {error && (
        <div className="mb-6 border border-destructive bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
          {error}
          <button
            onClick={handleRefresh}
            className="ml-2 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : listings.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">
            {lastSearch
              ? `No listings matching "${lastSearch}". Try a different search.`
              : "No computer hardware listings available right now."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((listing) => (
            <ExploreCard
              key={listing.lot_id}
              listing={listing}
              onRequest={handleRequest}
              onDetail={handleDetail}
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
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="For WhatsApp contact"
                  value={requestPhone}
                  onChange={(e) => setRequestPhone(e.target.value)}
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

      <Dialog open={!!detailListing} onOpenChange={(open) => !open && setDetailListing(null)}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          {detailListing && (
            <div className="flex flex-col md:flex-row max-h-[80vh]">
              <div className="relative aspect-[4/3] md:aspect-auto md:w-1/2 md:min-h-[400px] bg-muted">
                {detailListing.image_url ? (
                  <img
                    src={detailListing.image_url}
                    alt={detailListing.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <span className="absolute left-3 top-3 bg-accent px-2 py-0.5 font-mono text-xs font-bold text-accent-foreground">
                  LIVE
                </span>
                {detailListing.condition && (
                  <span className="absolute right-3 top-3 bg-black/60 px-2 py-0.5 font-mono text-xs text-white">
                    {detailListing.condition}
                  </span>
                )}
              </div>
              <div className="flex flex-col p-5 md:w-1/2 overflow-y-auto">
                <h2 className="font-display text-base font-semibold text-foreground leading-snug">
                  {detailListing.title}
                </h2>
                {detailListing.source_retailer && (
                  <p className="mt-1 text-sm text-muted-foreground">{detailListing.source_retailer}</p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Current Bid</p>
                    <p className="font-mono font-medium text-foreground">
                      {detailListing.current_bid != null
                        ? currencyFormat.format(detailListing.current_bid)
                        : "\u2014"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">MSRP</p>
                    <p className="font-mono text-muted-foreground">
                      {detailListing.msrp != null
                        ? currencyFormat.format(detailListing.msrp)
                        : "\u2014"}
                    </p>
                  </div>
                  {detailListing.current_bid && detailListing.msrp && (
                    <div className="col-span-2">
                      <div className="inline-flex items-center gap-1.5 rounded-sm bg-muted px-2 py-1">
                        <span className="font-mono text-xs font-medium text-accent">
                          {((detailListing.current_bid / detailListing.msrp) * 100).toFixed(1)}% of MSRP
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Pallets</p>
                    <p className="font-mono text-foreground">{detailListing.pallet_count ?? "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Units</p>
                    <p className="font-mono text-foreground">{detailListing.unit_count ?? "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-foreground">{detailListing.location || "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bids</p>
                    <p className="font-mono text-foreground">{detailListing.number_of_bids ?? "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Inventory</p>
                    <p className="text-foreground">{detailListing.inventory_type || "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Closing</p>
                    <p className="font-mono text-foreground">
                      {detailListing.close_time
                        ? new Date(detailListing.close_time).toLocaleDateString()
                        : "\u2014"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex gap-2 pt-5">
                  <button
                    onClick={() => {
                      setDetailListing(null)
                      handleRequest(detailListing)
                    }}
                    className="flex min-h-[44px] flex-1 items-center justify-center bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    {user ? "Request Lot" : "Sign In to Request"}
                  </button>
                  <a
                    href={detailListing.auction_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted"
                    aria-label="View on B-Stock"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={signInModal} onOpenChange={setSignInModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You need to sign in to request lots and track your sourcing requests.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-border text-muted-foreground"
                onClick={() => setSignInModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => router.push("/login?redirect=/explore")}
              >
                Sign In
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
