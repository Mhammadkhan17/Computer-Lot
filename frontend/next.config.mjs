/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    if (config.performance === false) config.performance = {}
    config.performance.maxEntrypointSize = 512_000
    config.performance.maxAssetSize = 512_000
    return config
  },
}
export default nextConfig
