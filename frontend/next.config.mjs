/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    if (config.performance === false) config.performance = {}
    config.performance.maxEntrypointSize = 512_000
    config.performance.maxAssetSize = 512_000
    return config
  },
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    // React Fast Refresh (dev-only hot-reload runtime) uses eval/'new Function'.
    // The production build ships no such code, so only allow unsafe-eval in dev.
    const isDev = process.env.NODE_ENV === "development"
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://*.supabase.co ${apiUrl}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
}
export default nextConfig
