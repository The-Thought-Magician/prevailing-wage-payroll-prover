import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PrevailingWagePayrollProver',
  description: 'Prove every public-works worker was paid the correct Davis-Bacon prevailing wage and fringe before the weekly WH-347 is filed.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
