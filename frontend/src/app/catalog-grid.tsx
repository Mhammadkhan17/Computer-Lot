"use client"

import { useCallback, useState, useMemo } from "react"
import { SearchBar } from "@/components/search-bar"
import { ProductCard } from "@/components/product-card"
import { Button } from "@/components/ui/button"
import type { Product } from "@/types"

const ITEMS_PER_PAGE = 12

interface Props {
  products: Product[]
  isAdmin?: boolean
}

export function CatalogGrid({ products, isAdmin }: Props) {
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()) ||
          p.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      ),
    [products, search]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const pageItems = filtered.slice(startIndex, endIndex)

  const handleSearch = useCallback((q: string) => {
    setSearch(q)
    setCurrentPage(1)
  }, [])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }, [totalPages])

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push("...")
      const start = Math.max(2, safePage - 1)
      const end = Math.min(totalPages - 1, safePage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (safePage < totalPages - 2) pages.push("...")
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, safePage])

  return (
    <div>
      <div className="mb-6 max-w-md">
        <SearchBar onSearch={handleSearch} />
      </div>

      {pageItems.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">No products found matching your search.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageItems.map((product) => (
              <ProductCard key={product.id} product={product} isAdmin={isAdmin} />
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            </p>

            <div className="flex items-center gap-1 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground"
                disabled={safePage === 1}
                onClick={() => goToPage(safePage - 1)}
                aria-label="Previous page"
              >
                Prev
              </Button>

              {pageNumbers.map((page, i) =>
                page === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">
                    &hellip;
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={page === safePage ? "default" : "outline"}
                    size="sm"
                    className={page === safePage ? "" : "border-border text-muted-foreground"}
                    onClick={() => goToPage(page)}
                    aria-label={`Page ${page}`}
                    aria-current={page === safePage ? "page" : undefined}
                  >
                    {page}
                  </Button>
                )
              )}

              <Button
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground"
                disabled={safePage === totalPages}
                onClick={() => goToPage(safePage + 1)}
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
