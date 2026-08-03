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
    // L-R3-4: only emit upgrade-insecure-requests + HSTS outside localhost.
    // In dev on http://localhost the directives would break the workflow;
    // in production (https) they harden the transport. HSTS is safe to send
    // from any deployment that is only ever served over HTTPS.
    const isProd = process.env.NODE_ENV === "production"
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
      // Force https upgrades for any mixed-content subresource in prod.
      ...(isProd ? ["upgrade-insecure-requests"] : []),
    ].join("; ")
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // L-R3-4: Strict-Transport-Security only for production HTTPS hosts.
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ]
  },
}
export default nextConfig
