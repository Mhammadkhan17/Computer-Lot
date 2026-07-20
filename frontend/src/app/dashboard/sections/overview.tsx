"use client"

import {
  ShoppingCart,
  DollarSign,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
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
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts"

interface OverviewProps {
  orders: OrderOverview[]
  pendingApprovalsCount: number
  productCount: number
  loading: boolean
}

interface OrderOverview {
  id: string
  readable_order_id: number
  customer_name: string
  total_amount: number
  status: string
  created_at: string
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const statusVariant: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  pending_whatsapp: "outline",
  processing: "secondary",
  completed: "default",
  cancelled: "destructive",
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "#1f4e79",
  },
}

function aggregateDailyRevenue(orders: OrderOverview[]) {
  const daily: Record<string, number> = {}
  orders.forEach((o) => {
    const day = new Date(o.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    daily[day] = (daily[day] || 0) + Number(o.total_amount)
  })
  return Object.entries(daily)
    .map(([date, total]) => ({ date, revenue: Math.round(total * 100) / 100 }))
    .slice(-14)
}

export function Overview({ orders, pendingApprovalsCount, productCount, loading }: OverviewProps) {
  const totalRevenue = orders.reduce(
    (sum, o) => sum + Number(o.total_amount),
    0
  )
  const completedOrders = orders.filter((o) => o.status === "completed").length
  const chartData = aggregateDailyRevenue(orders)

  const stats = [
    {
      title: "Total Orders",
      value: orders.length,
      icon: ShoppingCart,
      change: "+12%",
      positive: true,
    },
    {
      title: "Revenue",
      value: currencyFormat.format(totalRevenue),
      icon: DollarSign,
      change: "+8%",
      positive: true,
    },
    {
      title: "Pending Approvals",
      value: pendingApprovalsCount,
      icon: Users,
      change: pendingApprovalsCount > 0 ? "+" + pendingApprovalsCount : "0",
      positive: false,
    },
    {
      title: "Products",
      value: productCount,
      icon: Package,
      change: "—",
      positive: true,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#14161a] text-pretty">
          Dashboard Overview
        </h1>
        <p className="mt-1 text-sm text-[#6b7885]">
          Key metrics and performance at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="border-[#d7dce2] bg-white shadow-none">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                <CardTitle className="text-sm font-medium text-[#6b7885]">
                  {stat.title}
                </CardTitle>
                <Icon className="size-4 text-[#8896a4]" aria-hidden="true" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? (
                  <Skeleton className="h-8 w-24 bg-[#e4e7eb]" />
                ) : (
                  <>
                    <div className="text-2xl font-bold text-[#14161a]">
                      {stat.value}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs">
                      {stat.positive ? (
                        <ArrowUpRight className="size-3 text-[#45845f]" />
                      ) : (
                        <ArrowDownRight className="size-3 text-[#bf3a2b]" />
                      )}
                      <span
                        className={
                          stat.positive ? "text-[#45845f]" : "text-[#bf3a2b]"
                        }
                      >
                        {stat.change}
                      </span>
                      <span className="text-[#8896a4]">vs last month</span>
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-[#d7dce2] bg-white shadow-none lg:col-span-2">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="font-display text-base font-semibold text-[#14161a]">
              Revenue
            </CardTitle>
            <CardDescription>Daily revenue from orders</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <Skeleton className="h-[200px] w-full bg-[#e4e7eb]" />
            ) : chartData.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-[#8896a4]">
                No revenue data yet
              </div>
            ) : (
              <ChartContainer config={chartConfig} initialDimension={{ width: 600, height: 200 }}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e7eb" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#8896a4", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#8896a4", fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--color-revenue)"
                    radius={[0, 0, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#d7dce2] bg-white shadow-none">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="font-display text-base font-semibold text-[#14161a]">
              Order Status
            </CardTitle>
            <CardDescription>Completion rate</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <Skeleton className="h-[200px] w-full bg-[#e4e7eb]" />
            ) : orders.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-[#8896a4]">
                No orders yet
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(["completed", "processing", "pending_whatsapp", "cancelled"] as const).map(
                  (status) => {
                    const count = orders.filter((o) => o.status === status).length
                    const pct = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <Badge
                          variant={statusVariant[status] || "outline"}
                          className="w-28 shrink-0 justify-center text-xs capitalize"
                        >
                          {status.replace("_", " ")}
                        </Badge>
                        <div className="flex flex-1 items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-[#e4e7eb]">
                            <div
                              className="h-full rounded-full bg-[#1f4e79] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-xs text-[#6b7885]">
                            {pct}%
                          </span>
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#d7dce2] bg-white shadow-none">
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
          <div>
            <CardTitle className="font-display text-base font-semibold text-[#14161a]">
              Recent Orders
            </CardTitle>
            <CardDescription>Latest {Math.min(5, orders.length)} orders</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-[#e4e7eb]" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-[#8896a4]">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Recent orders">
                <caption className="sr-only">Recent orders list</caption>
                <thead>
                  <tr className="border-b border-[#d7dce2] text-left text-xs font-semibold uppercase tracking-wider text-[#6b7885]">
                    <th className="pb-2 pr-4">Order</th>
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-[#e4e7eb] last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-sm text-[#6b7885]">
                        #{order.readable_order_id}
                      </td>
                      <td className="py-2 pr-4 text-[#14161a]">
                        {order.customer_name}
                      </td>
                      <td className="py-2 pr-4 font-mono font-medium text-[#14161a]">
                        {currencyFormat.format(Number(order.total_amount))}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={statusVariant[order.status] || "outline"}
                        >
                          {order.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-[#6b7885]">
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
