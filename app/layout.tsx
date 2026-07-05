import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: '富育財務系統',
  description: '損益控管 · 薪資 · 月結貨主',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '富育財務',
  },
  icons: {
    icon: '/favicon-32.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="bg-slate-50">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
