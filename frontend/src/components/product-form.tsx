"use client"

import { useState, useId, useEffect, useRef } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { broadcastProductUpdate } from "@/lib/product-events"
import type { Product } from "@/types"

type ProductFormDialogProps =
  | {
      mode: "create"
      product?: never
      onSuccess?: () => void
      trigger?: React.ReactNode
    }
  | {
      mode: "edit"
      product: Product
      onSuccess?: () => void
      trigger?: React.ReactNode
    }

const IMAGE_BUCKET = "product-images"
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]

interface SpecRow {
  id: string
  key: string
  value: string
}

const defaultState = {
  title: "",
  sku: "",
  description: "",
  grade: "Grade_A" as string,
  items_per_lot: "1",
  retail_price_per_lot: "",
  wholesale_price_per_lot: "",
  minimum_wholesale_lots: "5",
  available_stock_lots: "0",
  image_urls: "",
  tags: "",
}

function specRowsFromProduct(product?: Product): SpecRow[] {
  const specs = product?.hardware_specifications
  if (!specs || typeof specs !== "object") return []
  return Object.entries(specs).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value:
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : String(value),
  }))
}

function initialStateFor(product?: Product) {
  if (!product) return { ...defaultState }
  return {
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
  }
}

function parseSpecValue(value: string): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toPublicUrl(supabase: ReturnType<typeof createClient>, path: string): string {
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

export function ProductFormDialog({ mode, product, onSuccess, trigger }: ProductFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => initialStateFor(product))
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => specRowsFromProduct(product))
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const uid = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setForm(initialStateFor(product))
      setSpecRows(specRowsFromProduct(product))
      setFiles([])
    }
  }, [open, product])

  const fieldId = (name: string) => `${uid}-${name}`

  const set =
    (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const addSpecRow = () => {
    setSpecRows((prev) => [...prev, { id: crypto.randomUUID(), key: "", value: "" }])
  }

  const updateSpecRow = (id: string, patch: Partial<Pick<SpecRow, "key" | "value">>) => {
    setSpecRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const removeSpecRow = (id: string) => {
    setSpecRows((prev) => prev.filter((row) => row.id !== id))
  }

  const buildSpecsObject = (): Record<string, unknown> | null => {
    const invalid = specRows.find((row) => row.key.trim() === "" && row.value.trim() !== "")
    if (invalid) return null
    const specs: Record<string, unknown> = {}
    specRows.forEach((row) => {
      const key = row.key.trim()
      const value = row.value.trim()
      if (!key || !value) return
      specs[key] = parseSpecValue(value)
    })
    return specs
  }

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    const invalid = selected.find((f) => !ALLOWED_IMAGE_TYPES.includes(f.type))
    if (invalid) {
      toast.error(`"${invalid.name}" is not a supported image type`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    const oversized = selected.find((f) => f.size > MAX_IMAGE_BYTES)
    if (oversized) {
      toast.error(`"${oversized.name}" exceeds the 5 MB limit`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setFiles((prev) => [...prev, ...selected])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const uploadFiles = async (): Promise<string[]> => {
    const supabase = createClient()
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split(".").pop() || "img"
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      })
      if (error) throw error
      urls.push(toPublicUrl(supabase, path))
    }
    return urls
  }

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

    const pastedUrls = form.image_urls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const invalidUrls = pastedUrls.filter((url) => !url.startsWith("https://"))
    if (invalidUrls.length > 0) {
      toast.error(`Image URLs must use https:// — invalid: ${invalidUrls.join(", ")}`)
      setSaving(false)
      return
    }
    const tags = form.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const specs = buildSpecsObject()
    if (specs === null) {
      toast.error("Every spec value needs a name (the left box)")
      setSaving(false)
      return
    }

    try {
      if (files.length > 0) {
        setUploading(true)
        toast.message(`Uploading ${files.length} image${files.length > 1 ? "s" : ""}\u2026`)
      }
      const uploadedUrls = await uploadFiles()
      const images = [...pastedUrls, ...uploadedUrls]

      const payload = {
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
      }

      const supabase = createClient()
      const { error } =
        mode === "edit"
          ? await supabase.from("products").update(payload).eq("id", product.id)
          : await supabase.from("products").insert(payload)

      if (error) throw error

      toast.success(mode === "edit" ? "Product updated" : "Product added")
      broadcastProductUpdate()
      if (mode === "create") {
        setForm({ ...defaultState })
        setSpecRows([])
      }
      setFiles([])
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product")
    } finally {
      setUploading(false)
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? `Edit ${product.title}` : "Add Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={fieldId("title")} className="text-xs font-medium text-foreground">Title *</label>
              <Input id={fieldId("title")} name="title" autoComplete="off" value={form.title} onChange={set("title")} placeholder="Product name" required autoFocus />
            </div>
            <div className="space-y-1">
              <label htmlFor={fieldId("sku")} className="text-xs font-medium text-foreground">SKU *</label>
              <Input id={fieldId("sku")} name="sku" autoComplete="off" value={form.sku} onChange={set("sku")} placeholder="CPU-001" required />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId("description")} className="text-xs font-medium text-foreground">Description</label>
            <textarea
              id={fieldId("description")}
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
              <label htmlFor={fieldId("grade")} className="text-xs font-medium text-foreground">Grade</label>
              <select
                id={fieldId("grade")}
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
              <label htmlFor={fieldId("items-per-lot")} className="text-xs font-medium text-foreground">Items per lot</label>
              <Input id={fieldId("items-per-lot")} name="items_per_lot" type="number" inputMode="numeric" min="1" value={form.items_per_lot} onChange={set("items_per_lot")} autoComplete="off" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={fieldId("retail-price")} className="text-xs font-medium text-foreground">Retail price ($) *</label>
              <Input id={fieldId("retail-price")} name="retail_price_per_lot" type="number" inputMode="decimal" step="0.01" min="0" value={form.retail_price_per_lot} onChange={set("retail_price_per_lot")} placeholder="0.00" autoComplete="off" required />
            </div>
            <div className="space-y-1">
              <label htmlFor={fieldId("wholesale-price")} className="text-xs font-medium text-foreground">Wholesale price ($) *</label>
              <Input id={fieldId("wholesale-price")} name="wholesale_price_per_lot" type="number" inputMode="decimal" step="0.01" min="0" value={form.wholesale_price_per_lot} onChange={set("wholesale_price_per_lot")} placeholder="0.00" autoComplete="off" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={fieldId("min-wholesale")} className="text-xs font-medium text-foreground">Min wholesale lots</label>
              <Input id={fieldId("min-wholesale")} name="minimum_wholesale_lots" type="number" inputMode="numeric" min="1" value={form.minimum_wholesale_lots} onChange={set("minimum_wholesale_lots")} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <label htmlFor={fieldId("stock")} className="text-xs font-medium text-foreground">Available stock lots</label>
              <Input id={fieldId("stock")} name="available_stock_lots" type="number" inputMode="numeric" min="0" value={form.available_stock_lots} onChange={set("available_stock_lots")} autoComplete="off" />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={fieldId("image-files")} className="text-xs font-medium text-foreground">Images</label>
            <div className="flex items-center gap-3 rounded border border-border bg-card p-3">
              <input
                id={fieldId("image-files")}
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                multiple
                onChange={handleFilesSelected}
                className="text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground hover:file:bg-accent/90"
              />
              <span className="text-xs text-muted-foreground">{"JPEG, PNG, WebP, GIF, AVIF \u00b7 max 5 MB each"}</span>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-xs text-foreground">
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                    >
                      {"\u00d7"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor={fieldId("image-urls")} className="text-xs font-medium text-foreground">Or add by image URL (comma-separated)</label>
              <textarea
                id={fieldId("image-urls")}
                name="image_urls"
                autoComplete="off"
                value={form.image_urls}
                onChange={set("image_urls")}
                placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                rows={2}
                className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={fieldId("tags")} className="text-xs font-medium text-foreground">Tags (comma-separated)</label>
              <Input id={fieldId("tags")} name="tags" autoComplete="off" value={form.tags} onChange={set("tags")} placeholder="intel, cpu, lga1700" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Specifications</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground"
                onClick={addSpecRow}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add spec
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              e.g. socket, cores, speed — no need for JSON.
            </p>
            {specRows.length === 0 ? (
              <p className="rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                No specs yet. Click "Add spec" to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {specRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      autoComplete="off"
                      value={row.key}
                      onChange={(e) => updateSpecRow(row.id, { key: e.target.value })}
                      placeholder="Name (e.g. socket)"
                      className="flex-1"
                      aria-label="Specification name"
                    />
                    <Input
                      autoComplete="off"
                      value={row.value}
                      onChange={(e) => updateSpecRow(row.id, { value: e.target.value })}
                      placeholder="Value (e.g. LGA1700)"
                      className="flex-1"
                      aria-label="Specification value"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecRow(row.id)}
                      aria-label="Remove spec"
                      className="rounded-sm p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="border-border text-muted-foreground" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={saving || uploading}>
              {saving || uploading
                ? "Saving\u2026"
                : mode === "edit"
                  ? "Save Changes"
                  : "Add Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
