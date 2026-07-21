"use client"

import { useState } from "react"
import { ExternalLink, ImageOff } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

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

interface ExploreCardProps {
  listing: ExploreListing
  onRequest: (listing: ExploreListing) => void
  isAuthenticated: boolean
}

export function ExploreCard({ listing, onRequest, isAuthenticated }: ExploreCardProps) {
  const [imgError, setImgError] = useState(false)

  const timeLeft = listing.close_time
    ? Math.max(0, Math.floor((new Date(listing.close_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  const bidToMsrp = listing.current_bid && listing.msrp
    ? ((listing.current_bid / listing.msrp) * 100).toFixed(1)
    : null

  return (
    <Card className="flex flex-col overflow-hidden border-border bg-card shadow-none">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {listing.image_url && !imgError ? (
          <img
            src={listing.image_url}
            alt={listing.title}
            width={400}
            height={300}
            loading="lazy"
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <span className="absolute left-2 top-2 bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">
          LIVE
        </span>
        {listing.condition && (
          <span className="absolute right-2 top-2 bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
            {listing.condition}
          </span>
        )}
      </div>

      <CardContent className="flex-1 space-y-3 p-4 pb-3">
        <div>
          <h3 className="font-display text-sm font-semibold leading-snug text-foreground line-clamp-2">
            {listing.title}
          </h3>
          {listing.source_retailer && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {listing.source_retailer}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {listing.pallet_count != null && (
            <span>{listing.pallet_count} pallet{listing.pallet_count !== 1 ? "s" : ""}</span>
          )}
          {listing.unit_count != null && listing.unit_count > 0 && (
            <>
              <span className="text-border">|</span>
              <span>{listing.unit_count} unit{listing.unit_count !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current Bid</span>
            <span className="font-mono font-medium text-foreground">
              {listing.current_bid != null
                ? currencyFormat.format(listing.current_bid)
                : "\u2014"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">MSRP</span>
            <span className="font-mono font-medium text-muted-foreground">
              {listing.msrp != null
                ? currencyFormat.format(listing.msrp)
                : "\u2014"}
            </span>
          </div>
        </div>

        {bidToMsrp != null && (
          <div className="flex items-center gap-2 rounded-sm bg-muted px-2 py-1">
            <span className="font-mono text-[11px] font-medium text-accent">
              {bidToMsrp}% of MSRP
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {listing.location && <span>{listing.location}</span>}
          {timeLeft != null && (
            <span className="font-mono">
              {timeLeft === 0 ? "Closing today" : `${timeLeft}d left`}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 p-3 pt-0">
        <button
          onClick={() => onRequest(listing)}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          {isAuthenticated ? "Request Lot" : "Sign In to Request"}
        </button>
        <a
          href={listing.auction_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted"
          aria-label="View on B-Stock"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </CardFooter>
    </Card>
  )
}
