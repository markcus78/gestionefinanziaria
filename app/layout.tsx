import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Gestione Finanziaria — Wellness Town Group',
  description: 'Sistema di pianificazione finanziaria multi-societaria',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className={`${geist.variable} antialiased bg-zinc-950 text-zinc-100`}>
        {children}
      </body>
    </html>
  )
}
