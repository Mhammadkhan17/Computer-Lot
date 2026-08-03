"use client"

import { useState, useRef } from "react"
import { Search, Plus, Upload, Download, Pencil, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProductFormDialog } from "@/components/product-form"
import { broadcastProductUpdate } from "@/lib/product-events"
import type { Product } from "@/types"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const gradeVariant: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  Grade_A: "default",
  Grade_B: "secondary",
  Grade_C: "outline",
  For_Parts: "destructive",
}

interface ProductsSectionProps {
  products: Product[]
  loading: boolean
  onRefresh?: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function ProductsSection({ products, loading, onRefresh }: ProductsSectionProps) {
  const [search, setSearch] = useState("")
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<{ row: number; sku: string; reason: string }[] | null>(null)
  const [importInserted, setImportInserted] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated")

      const form = new FormData()
      form.append("file", file)

      const res = await fetch(`${API_URL}/admin/products/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.detail || "Import failed")

      if (result.errors?.length > 0) {
        setImportErrors(result.errors)
        setImportInserted(result.inserted)
        toast.error(`Inserted ${result.inserted} product(s) with ${result.errors.length} error(s)`)
      } else {
        toast.success(`Inserted ${result.inserted} product(s)`)
        setImportErrors(null)
        setImportInserted(0)
        broadcastProductUpdate()
        onRefresh?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated")

      const res = await fetch(`${API_URL}/admin/products/template`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to download template")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "product-import-template.csv"
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    }
  }

  const handleDelete = async (productId: string, productTitle: string) => {
    setDeleteConfirm(null)
    try {
      const supabase = createClient()
      const { data: linkedOrders } = await supabase
        .from("order_items")
        .select("id", { count: "exact" })
        .eq("product_id", productId)
      if (linkedOrders && linkedOrders.length > 0) {
        toast.error(`Cannot delete "${productTitle}": ${linkedOrders.length} order(s) reference this product. Remove or reassign those orders first.`)
        setDeleteConfirm(null)
        return
      }
      const { error } = await supabase.from("products").delete().eq("id", productId)
      if (error) throw error
      toast.success("Product deleted")
      broadcastProductUpdate()
      setDeleteConfirm(null)
      onRefresh?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product")
      setDeleteConfirm(null)
    }
  }

  const filtered = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Products
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your product inventory ({products.length} total).
        </p>
      </div>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-foreground">
            All Products
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap max-sm:justify-end">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleImport}
              className="hidden"
              aria-label="Upload CSV file"
            />
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="Import products from CSV"
            >
              {importing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              {importing ? "Importing\u2026" : "Import CSV"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground"
              onClick={handleDownloadTemplate}
              title="Download CSV template"
            >
              <Download className="mr-1 h-4 w-4" />
              Template
            </Button>
            <ProductFormDialog
              mode="create"
              onSuccess={onRefresh}
              trigger={
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Product
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="mb-4 relative max-w-xs w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              name="search-products"
              autoComplete="off"
              placeholder="Search products\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search products"
            />
          </div>

          {importErrors && (
            <div className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-destructive">
                  {importInserted > 0
                    ? `Inserted ${importInserted} product(s) with ${importErrors.length} error(s):`
                    : `${importErrors.length} row(s) failed validation:`}
                </p>
                <button
                  onClick={() => setImportErrors(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="Dismiss import errors"
                >
                  Dismiss
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" aria-label="CSV import errors">
                  <thead>
                    <tr className="border-b border-destructive/20 text-left font-semibold text-destructive">
                      <th className="pb-1 pr-3">Row</th>
                      <th className="pb-1 pr-3">SKU</th>
                      <th className="pb-1">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.map((err, i) => (
                      <tr key={i} className="border-b border-destructive/10 last:border-0">
                        <td className="py-1 pr-3 font-mono text-muted-foreground">{err.row}</td>
                        <td className="py-1 pr-3 font-mono text-foreground">{err.sku || "\u2014"}</td>
                        <td className="py-1 text-foreground">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search ? "No products match your search." : "No products yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="All products">
                <caption className="sr-only">All products list</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">SKU</th>
                    <th className="pb-2 pr-4">Title</th>
                    <th className="pb-2 pr-4">Grade</th>
                    <th className="pb-2 pr-4">Stock</th>
                    <th className="pb-2 pr-4">Retail</th>
                    <th className="pb-2 pr-4">Wholesale</th>
                    <th className="pb-2 pr-4">Approved</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-muted/20"
                    >
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {product.sku}
                      </td>
                      <td className="py-2 pr-4 text-foreground font-medium">
                        {product.title}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={gradeVariant[product.grade] || "outline"} className="text-xs">
                          {product.grade.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {product.available_stock_lots === 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            Out of Stock
                          </Badge>
                        ) : (
                          <span className="font-mono text-sm text-foreground">
                            {product.available_stock_lots}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-sm text-foreground">
                        {currencyFormat.format(Number(product.retail_price_per_lot))}
                      </td>
                      <td className="py-2 pr-4 font-mono text-sm text-primary">
                        {currencyFormat.format(Number(product.wholesale_price_per_lot))}
                      </td>
                      <td className="py-2 pr-4 font-mono text-sm text-primary">
                        {currencyFormat.format(Number(product.approved_price_per_lot))}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                            <ProductFormDialog
                              mode="edit"
                              product={product}
                              onSuccess={onRefresh}
                              trigger={
                                <button
                                  className="rounded-sm p-1 max-sm:min-h-[44px] max-sm:min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                  aria-label={`Edit ${product.title}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              }
                            />
                            <button
                              className="rounded-sm p-1 max-sm:min-h-[44px] max-sm:min-w-[44px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              aria-label={`Delete ${product.title}`}
                              onClick={() => setDeleteConfirm({ id: product.id, title: product.title })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong className="text-foreground">{deleteConfirm?.title}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="border-border text-muted-foreground" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id, deleteConfirm.title)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
