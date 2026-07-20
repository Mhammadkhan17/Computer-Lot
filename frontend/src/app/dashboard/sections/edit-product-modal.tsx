"use client"

import { useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Product } from "@/types"

interface EditProductModalProps {
  product: Product
  onSuccess?: () => void
  children?: React.ReactNode
}

async function broadcastProductUpdate() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${API_URL}/admin/products/broadcast-update`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    // broadcast is best-effort
  }
}

export function EditProductModal({ product, onSuccess, children }: EditProductModalProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: product.title,
    sku: product.sku,
    description: product.description || "",
    grade: product.grade,
    items_per_lot: String(product.items_per_lot),
    retail_price_per_lot: String(product.retail_price_per_lot),
    wholesale_price_per_lot: String(product.wholesale_price_per_lot),
    minimum_wholesale_lots: String(product.minimum_wholesale_lots),
    available_stock_lots: String(product.available_stock_lots),
    image_urls: Array.isArray(product.images) ? product.images.join(", ") : "",
    tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
    hardware_specifications: JSON.stringify(product.hardware_specifications || {}, null, 2),
  })
  const [saving, setSaving] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const price = Number.parseFloat(form.retail_price_per_lot)
    const wholesalePrice = Number.parseFloat(form.wholesale_price_per_lot)
    if (!form.title || !form.sku || Number.isNaN(price) || Number.isNaN(wholesalePrice)) {
      toast.error("Title, SKU, and prices are required")
      setSaving(false)
      return
    }

    const images = form.image_urls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const tags = form.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    let specs: Record<string, unknown> = {}
    try {
      specs = JSON.parse(form.hardware_specifications)
    } catch {
      toast.error("Hardware specifications must be valid JSON")
      setSaving(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("products")
        .update({
          title: form.title,
          sku: form.sku,
          description: form.description || null,
          grade: form.grade,
          items_per_lot: Number.parseInt(form.items_per_lot) || 1,
          retail_price_per_lot: price,
          wholesale_price_per_lot: wholesalePrice,
          minimum_wholesale_lots: Number.parseInt(form.minimum_wholesale_lots) || 5,
          available_stock_lots: Number.parseInt(form.available_stock_lots) || 0,
          images: images.length > 0 ? images : null,
          tags: tags.length > 0 ? tags : null,
          hardware_specifications: specs,
        })
        .eq("id", product.id)

      if (error) throw error

      toast.success("Product updated")
      broadcastProductUpdate()
      setOpen(false)
      onSuccess?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update product")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {product.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-title" className="text-xs font-medium text-foreground">Title *</label>
              <Input id="edit-title" name="title" autoComplete="off" value={form.title} onChange={set("title")} placeholder="Product name" required autoFocus />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-sku" className="text-xs font-medium text-foreground">SKU *</label>
              <Input id="edit-sku" name="sku" autoComplete="off" value={form.sku} onChange={set("sku")} placeholder="CPU-001" required />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-description" className="text-xs font-medium text-foreground">Description</label>
            <textarea
              id="edit-description"
              name="description"
              autoComplete="off"
              value={form.description}
              onChange={set("description")}
              placeholder="Product description..."
              rows={3}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-grade" className="text-xs font-medium text-foreground">Grade</label>
              <select
                id="edit-grade"
                name="grade"
                value={form.grade}
                onChange={set("grade")}
                className="w-full border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:bg-gray-800 dark:text-white"
              >
                <option value="Grade_A">Grade A</option>
                <option value="Grade_B">Grade B</option>
                <option value="Grade_C">Grade C</option>
                <option value="For_Parts">For Parts</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-items-per-lot" className="text-xs font-medium text-foreground">Items per lot</label>
              <Input id="edit-items-per-lot" name="items_per_lot" type="number" inputMode="numeric" min="1" value={form.items_per_lot} onChange={set("items_per_lot")} autoComplete="off" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-retail-price" className="text-xs font-medium text-foreground">Retail price ($) *</label>
              <Input id="edit-retail-price" name="retail_price_per_lot" type="number" inputMode="decimal" step="0.01" min="0" value={form.retail_price_per_lot} onChange={set("retail_price_per_lot")} placeholder="0.00" autoComplete="off" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-wholesale-price" className="text-xs font-medium text-foreground">Wholesale price ($) *</label>
              <Input id="edit-wholesale-price" name="wholesale_price_per_lot" type="number" inputMode="decimal" step="0.01" min="0" value={form.wholesale_price_per_lot} onChange={set("wholesale_price_per_lot")} placeholder="0.00" autoComplete="off" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-min-wholesale" className="text-xs font-medium text-foreground">Min wholesale lots</label>
              <Input id="edit-min-wholesale" name="minimum_wholesale_lots" type="number" inputMode="numeric" min="1" value={form.minimum_wholesale_lots} onChange={set("minimum_wholesale_lots")} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-stock" className="text-xs font-medium text-foreground">Available stock lots</label>
              <Input id="edit-stock" name="available_stock_lots" type="number" inputMode="numeric" min="0" value={form.available_stock_lots} onChange={set("available_stock_lots")} autoComplete="off" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-image-urls" className="text-xs font-medium text-foreground">Image URLs (comma-separated)</label>
            <textarea
              id="edit-image-urls"
              name="image_urls"
              autoComplete="off"
              value={form.image_urls}
              onChange={set("image_urls")}
              placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
              rows={2}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-tags" className="text-xs font-medium text-foreground">Tags (comma-separated)</label>
              <Input id="edit-tags" name="tags" autoComplete="off" value={form.tags} onChange={set("tags")} placeholder="intel, cpu, lga1700" />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-specs" className="text-xs font-medium text-foreground">Specs (JSON)</label>
              <Input id="edit-specs" name="hardware_specifications" autoComplete="off" value={form.hardware_specifications} onChange={set("hardware_specifications")} placeholder='{"cores": 12}' />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="border-border text-muted-foreground" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={saving}>
              {saving ? "Saving\u2026" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
