import type { ReactNode } from 'react'
import { Flame } from '../../components/Flame'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6" style={{ paddingTop: 'calc(var(--safe-top) + 24px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
      <div className="flex flex-col items-center pb-6 pt-4 text-center">
        <Flame size={110} />
        <h1 className="mt-2 bg-gradient-to-r from-fuego-600 to-rosa-500 bg-clip-text text-3xl font-black tracking-tight text-transparent">Fuego Juntos</h1>
        <p className="muted mt-1 text-sm">Entrenen, cuídense y mantengan la llama viva 🔥</p>
      </div>
      <div className="card p-6">
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
