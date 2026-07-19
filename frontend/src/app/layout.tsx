import type { Metadata } from "next"
import "./globals.css"
import { Navbar } from "@/components/navbar"
import { CartDrawer } from "@/components/cart-drawer"
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Lot Liquidation — Computer Component Lots",
  description: "Wholesale and retail computer component lots — inspected, graded, ready to ship.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen">
        <Navbar />
        {children}
        <CartDrawer />
      </body>
    </html>
  )
}
