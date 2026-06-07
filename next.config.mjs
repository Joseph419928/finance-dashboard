/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output was dropped: it doesn't reliably bundle the Prisma query
  // engine, which crashed the server on Railway. We run a normal `next start`
  // against the full node_modules instead.
}
export default nextConfig
