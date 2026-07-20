"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SearchBarProps {
  placeholder?: string
  onSearch: (query: string) => void
}

export function SearchBar({ placeholder = "Search by name, SKU, or tag\u2026", onSearch }: SearchBarProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(searchParams.get("search") || "")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = searchParams.get("search") || ""
    setValue(q)
    onSearch(q)
  }, [searchParams, onSearch])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      setValue(v)

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (v) params.set("search", v)
        else params.delete("search")
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        onSearch(v)
      }, 250)
    },
    [searchParams, router, pathname, onSearch]
  )

  const handleClear = useCallback(() => {
    setValue("")
    const params = new URLSearchParams(searchParams.toString())
    params.delete("search")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    onSearch("")
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [searchParams, router, pathname, onSearch])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="search-catalog"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className="pl-9 pr-8"
      />
      {value && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
