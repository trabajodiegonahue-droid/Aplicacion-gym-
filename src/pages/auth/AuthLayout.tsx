import type { ReactNode } from 'react'
import { Flame } from '../../components/Flame'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6" style={{ paddingTop: 'calc(var(--safe-top) + 32px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
      <div className="flex flex-col items-center pb-8 pt-6 text-center">
        <Flame size={72} />
        <h1 className="mt-4 text-[28px] font-bold tracking-[-0.035em]">Fuego Juntos</h1>
        <p className="muted mt-1 text-[15px]">Entrenen juntos, aunque estén lejos.</p>
      </div>
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
        {subtitle && <p className="muted mt-1 text-[14px] leading-snug">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
