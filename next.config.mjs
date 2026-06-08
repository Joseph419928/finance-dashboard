import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicit '@' alias so '@/lib/*' resolves regardless of whether the build
  // environment picks up tsconfig `paths` (Railway/Nixpacks did not).
  webpack: (config) => {
    config.resolve.alias['@'] = __dirname
    return config
  },
}

export default nextConfig
