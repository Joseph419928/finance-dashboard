import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: '富育財務系統',
  description: '損益控管 · 薪資 · 月結貨主',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
