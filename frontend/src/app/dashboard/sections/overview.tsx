"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { AdminOrder, ItemGrade, OrderStatus, Product } from "@/types"
import { STATUS_META } from "./status-meta"

interface OverviewProps {
  orders: AdminOrder[]
  products: Product[]
  pendingApprovalsCount: number
  loading: boolean
}

interface GradeSegment {
  grade: ItemGrade
  label: string
  lots: number
  pct: number
  color: string
}

interface StatusSegment {
  status: OrderStatus
  label: string
  count: number
  pct: number
  color: string
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const GRADE_META: Record<ItemGrade, { label: string; color: string }> = {
  Grade_A: { label: "Grade A", color: "var(--color-grade-a)" },
  Grade_B: { label: "Grade B", color: "var(--color-grade-b)" },
  Grade_C: { label: "Grade C", color: "var(--color-grade-c)" },
  For_Parts: { label: "For Parts", color: "var(--color-grade-parts)" },
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--color-accent)",
  },
} satisfies ChartConfig

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return mounted
}

function aggregateDailyRevenue(orders: AdminOrder[]) {
  const daily: Record<string, number> = {}
  orders.forEach((o) => {
    const day = new Date(o.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    daily[day] = (daily[day] || 0) + Number(o.total_amount)
  })
  return Object.entries(daily)
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
    .slice(-14)
}

function computeGradeMix(products: Product[]): GradeSegment[] {
  const gradeOrder: ItemGrade[] = ["Grade_A", "Grade_B", "Grade_C", "For_Parts"]
  const totalLots = products.reduce((sum, p) => sum + (Number(p.available_stock_lots) || 0), 0)
  return gradeOrder.map((grade) => {
    const lots = products
      .filter((p) => p.grade === grade)
      .reduce((sum, p) => sum + (Number(p.available_stock_lots) || 0), 0)
    return {
      grade,
      label: GRADE_META[grade].label,
      lots,
      pct: totalLots > 0 ? (lots / totalLots) * 100 : 0,
      color: GRADE_META[grade].color,
    }
  })
}

function computeStatusSplit(orders: AdminOrder[]): StatusSegment[] {
  const statusOrder: OrderStatus[] = [
    "completed",
    "processing",
    "pending_whatsapp",
    "cancelled",
  ]
  const total = orders.length
  return statusOrder.map((status) => {
    const count = orders.filter((o) => o.status === status).length
    return {
      status,
      label: STATUS_META[status].label,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      color: STATUS_META[status].color,
    }
  })
}

export function Overview({ orders, products, pendingApprovalsCount, loading }: OverviewProps) {
  const mounted = useMounted()

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const totalLots = orders.reduce(
    (sum, o) => sum + (o.order_items ?? []).reduce((s, it) => s + it.quantity_ordered, 0),
    0
  )
  const avgOrder = orders.length > 0 ? totalRevenue / orders.length : 0
  const chartData = aggregateDailyRevenue(orders)
  const gradeMix = computeGradeMix(products)
  const statusSplit = computeStatusSplit(orders)

  const tallies = [
    { label: "Avg order", value: orders.length > 0 ? currencyFormat.format(avgOrder) : "—" },
    { label: "Lots sold", value: totalLots.toLocaleString() },
    { label: "Pending", value: pendingApprovalsCount.toLocaleString() },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Sort line / Overview
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground text-pretty">
          Inventory board
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock on line, order flow, and revenue at a glance.
        </p>
      </div>

      <section
        className="border border-border bg-card"
        aria-label="Revenue summary"
      >
        <div className="grid gap-6 p-5 sm:grid-cols-[1.2fr_1fr] sm:gap-0 sm:p-0">
          <div className="animate-in fade-in duration-500 sm:px-6 sm:py-7">
            <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Revenue · All orders
            </p>
            {loading ? (
              <Skeleton className="mt-3 h-10 w-48 bg-muted" />
            ) : (
              <p className="mt-2 font-mono text-4xl font-medium text-foreground tabular-nums sm:text-5xl">
                {currencyFormat.format(totalRevenue)}
              </p>
            )}
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {orders.length.toLocaleString()} orders · {totalLots.toLocaleString()} lots
              {orders.length > 0 ? ` · ${Math.round(totalRevenue / orders.length)} avg/order` : ""}
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border border-t border-border sm:border-t-0">
            {tallies.map((tally) => (
              <div key={tally.label} className="flex flex-col justify-center px-4 py-5 sm:px-5">
                <p className="font-mono text-lg font-medium text-foreground tabular-nums">
                  {loading ? <Skeleton className="h-6 w-16 bg-muted" /> : tally.value}
                </p>
                <p className="mt-1 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {tally.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-border bg-card shadow-none">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="font-display text-base font-semibold text-foreground">
              Stock on line
            </CardTitle>
            <CardDescription>Available lots by grade</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <Skeleton className="h-[160px] w-full" />
            ) : products.length === 0 || gradeMix.every((g) => g.lots === 0) ? (
              <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
                No stock on line
              </div>
            ) : (
              <div>
                <div
                  role="img"
                  aria-label={gradeMix
                    .map((g) => `${g.label} ${g.lots} lots`)
                    .join(", ")}
                  className="flex h-3 w-full overflow-hidden bg-muted"
                >
                  {gradeMix.map((seg) => (
                    <div
                      key={seg.grade}
                      className="h-full transition-[width] duration-700 ease-out"
                      style={{ width: mounted ? `${seg.pct}%` : "0%", backgroundColor: seg.color }}
                    />
                  ))}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {gradeMix.map((seg) => (
                    <li key={seg.grade} className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-sm text-foreground">{seg.label}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                        {seg.lots} lots · {Math.round(seg.pct)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-none lg:col-span-2">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="font-display text-base font-semibold text-foreground">
              Revenue
            </CardTitle>
            <CardDescription>Daily order value — last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No revenue data yet
              </div>
            ) : (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[240px] w-full"
              >
                <BarChart
                  data={chartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-foreground">
            Order flow
          </CardTitle>
          <CardDescription>Share of orders by stage</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-[80px] w-full" />
          ) : orders.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
              No orders yet
            </div>
          ) : (
            <div>
              <div
                role="img"
                aria-label={statusSplit.map((s) => `${s.label} ${s.count}`).join(", ")}
                className="flex h-2.5 w-full overflow-hidden bg-muted"
              >
                {statusSplit.map((seg) => (
                  <div
                    key={seg.status}
                    className="h-full transition-[width] duration-700 ease-out"
                    style={{ width: mounted ? `${seg.pct}%` : "0%", backgroundColor: seg.color }}
                  />
                ))}
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {statusSplit.map((seg) => (
                  <li key={seg.status} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-foreground">{seg.label}</span>
                    <span className="font-mono text-xs tabular-nums">
                      {seg.count} · {Math.round(seg.pct)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-foreground">
            Recent orders
          </CardTitle>
          <CardDescription>Latest {Math.min(5, orders.length)} orders</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Recent orders">
                <caption className="sr-only">Recent orders list</caption>
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    <th className="pb-2 pr-4">Order</th>
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4 text-right">Lots</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-mono text-sm text-muted-foreground">
                        #{order.readable_order_id}
                      </td>
                      <td className="py-2 pr-4 text-foreground">{order.customer_name}</td>
                      <td className="py-2 pr-4 text-right font-mono text-sm text-foreground tabular-nums">
                        {(order.order_items ?? []).reduce((s, it) => s + it.quantity_ordered, 0)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-sm font-medium text-foreground tabular-nums">
                        {currencyFormat.format(Number(order.total_amount))}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                          aria-label={STATUS_META[order.status].label}
                        >
                          <span
                            aria-hidden="true"
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: STATUS_META[order.status].color }}
                          />
                          {STATUS_META[order.status].label}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
