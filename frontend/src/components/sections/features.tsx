import { ClipboardCheck, Shield, Truck, Scale, Gauge, Package } from "lucide-react"

const features = [
  {
    icon: ClipboardCheck,
    title: "Professionally Graded",
    description:
      "Every lot is inspected and assigned a condition grade (A through For Parts) so you know exactly what you're getting.",
  },
  {
    icon: Shield,
    title: "Grade & Condition Transparency",
    description:
      "Detailed hardware specifications and manifest files available for every lot. No surprises on delivery.",
  },
  {
    icon: Scale,
    title: "Hybrid Pricing",
    description:
      "Retail pricing for small orders. Automatic wholesale discounts when you buy 10 or more lots across any products.",
  },
  {
    icon: Package,
    title: "Lot-Based Inventory",
    description:
      "Items sold in standardized lots. Each lot contains a known quantity of identical components for easy planning.",
  },
  {
    icon: Truck,
    title: "Warehouse Ready",
    description:
      "All inventory is stored in our warehouse, inspected, and ready to ship. No dropshipping or third-party fulfillment.",
  },
  {
    icon: Gauge,
    title: "Fast & Simple Checkout",
    description:
      "Order directly through WhatsApp. No account creation required for browsing. Checkout in under a minute.",
  },
]

export function FeaturesSection() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 font-mono text-xs font-medium tracking-[0.15em] text-accent">
            WHY CHOOSE US
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Built for Liquidators, by Liquidators
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We understand the computer parts market. Our platform is designed
            to move inventory fast with minimal friction.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border border-border p-5 transition-colors hover:border-accent/30"
            >
              <div className="flex h-9 w-9 items-center justify-center bg-accent/10">
                <feature.icon className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-sm font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
