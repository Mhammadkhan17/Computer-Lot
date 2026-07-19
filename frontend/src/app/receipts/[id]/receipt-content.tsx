"use client"

import { Barcode } from "lucide-react"
import { Button } from "@/components/ui/button"

interface OrderData {
  id: string
  readable_order_id: number
  customer_name: string
  customer_phone: string
  total_amount: number
  status: string
  created_at: string
  order_items: Array<{
    id: string
    product_id: string
    quantity_ordered: number
    unit_price_applied: number
    products: { title: string } | null
  }>
}

interface Props {
  order: OrderData
}

export function ReceiptContent({ order }: Props) {
  const message = encodeURIComponent(
    `Order #${order.readable_order_id}\nCustomer: ${order.customer_name}\nTotal: $${Number(order.total_amount).toFixed(2)}\n\nStatus: ${order.status}`
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <Barcode className="mx-auto h-8 w-8 text-[#d45113]" />
        <h1 className="mt-3 font-display text-2xl font-bold text-[#14161a]">
          Order #{order.readable_order_id}
        </h1>
      </div>

      <div className="mb-8 space-y-4">
        <div className="border border-[#d7dce2] bg-white px-4 py-4">
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.15em] text-[#6b7885]">
            Order Details
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6b7885]">Customer</span>
              <span className="text-[#14161a]">{order.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7885]">Phone</span>
              <span className="font-mono text-[#14161a]">{order.customer_phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7885]">Status</span>
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-[#6b7885]">
                {order.status.replace("_", " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7885]">Date</span>
              <span className="font-mono text-[#14161a]">
                {new Date(order.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="border border-[#d7dce2] bg-white px-4 py-4">
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.15em] text-[#6b7885]">
            Items
          </h2>
          <div className="space-y-3 text-sm">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span className="text-[#14161a]">
                  {item.products?.title || "Unknown Product"}
                  <span className="text-[#6b7885]"> &times;{item.quantity_ordered}</span>
                </span>
                <span className="font-mono font-medium text-[#14161a]">
                  ${(item.unit_price_applied * item.quantity_ordered).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[#d7dce2] pt-3 font-display text-lg font-bold text-[#14161a]">
              <span>Total</span>
              <span className="font-mono">${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <Button
        className="w-full bg-[#d45113] text-white hover:bg-[#bf4610]"
        asChild
      >
        <a
          href={`https://wa.me/${process.env.NEXT_PUBLIC_MERCHANT_PHONE || "1234567890"}?text=${message}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Contact Merchant on WhatsApp
        </a>
      </Button>
    </div>
  )
}
