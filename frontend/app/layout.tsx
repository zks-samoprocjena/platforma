import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'latin-ext'] })

export const metadata: Metadata = {
  title: 'AI Samoprocjena - ZKS/NIS2 Compliance Platform',
  description: 'Platforma za samoprocjenu kibernetičke sigurnosti prema ZKS/NIS2 propisima',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html data-theme="light">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}