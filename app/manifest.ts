import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '富育財務系統',
    short_name: '富育財務',
    description: '損益控管 · 薪資 · 月結貨主',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#0f172a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
