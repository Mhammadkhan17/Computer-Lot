import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "sonner"
import { Navbar } from "@/components/navbar"
import { CartDrawer } from "@/components/cart-drawer"

export const metadata: Metadata = {
  title: "Lot Liquidation — Computer Component Lots",
  description: "Wholesale and retail computer component lots — inspected, graded, ready to ship.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <meta name="theme-color" content="#0f1117" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen">
        <Navbar />
        {children}
        <CartDrawer />
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  )
}
