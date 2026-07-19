"use client"

import { useCallback, useState } from "react"
import { SearchBar } from "@/components/search-bar"
import { ProductCard } from "@/components/product-card"
import type { Product } from "@/types"

interface Props {
  products: Product[]
}

export function CatalogGrid({ products }: Props) {
  const [search, setSearch] = useState("")

  const filtered = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  const handleSearch = useCallback((q: string) => {
    setSearch(q)
  }, [])

  return (
    <div>
      <div className="mb-6 max-w-md">
        <SearchBar onSearch={handleSearch} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-[#6b7885]">No products found matching your search.</p>
        </div>
      )}
    </div>
  )
}
