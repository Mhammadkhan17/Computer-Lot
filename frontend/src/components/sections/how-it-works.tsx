import { Search, ShoppingCart, MessageSquare } from "lucide-react"

const steps = [
  {
    icon: Search,
    title: "Browse Inventory",
    description:
      "Search and filter through our catalog of inspected computer component lots. Each lot is graded and priced for retail or wholesale.",
  },
  {
    icon: ShoppingCart,
    title: "Add to Cart",
    description:
      "Select your lots and add them to your cart. Wholesale pricing is automatically applied when you meet the 10-lot threshold.",
  },
  {
    icon: MessageSquare,
    title: "Order via WhatsApp",
    description:
      "Checkout sends your order details directly to our team via WhatsApp. We confirm availability and arrange shipping.",
  },
]

export function HowItWorks() {
  return (
    <section className="border-b border-border bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 font-mono text-xs font-medium tracking-[0.15em] text-accent">
            HOW IT WORKS
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            From Browse to Order in Three Steps
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No account required to browse. Just add your lots and checkout
            when you&apos;re ready.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="relative border border-border p-6 bg-background">
              <span className="flex h-10 w-10 items-center justify-center font-mono text-sm font-bold text-accent-foreground bg-accent rounded-full">
                {i + 1}
              </span>
              <div className="mt-4 flex h-10 w-10 items-center justify-center bg-accent/10">
                <step.icon className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
