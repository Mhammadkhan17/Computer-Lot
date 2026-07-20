import type { Metadata } from "next"
import "./globals.css"
import { Navbar } from "@/components/navbar"
import { CartDrawer } from "@/components/cart-drawer"

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
    <html lang="en" className="bg-[#f0f2f5]">
      <head>
        <meta name="theme-color" content="#14161a" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-[#14161a] focus:ring-2 focus:ring-[#1f4e79]">
          Skip to main content
        </a>
        <Navbar />
        {children}
        <CartDrawer />
      </body>
    </html>
  )
}
