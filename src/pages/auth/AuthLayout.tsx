import type { ReactNode } from 'react'
import { Person, PRESETS } from '../../components/Person'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6" style={{ paddingTop: 'calc(var(--safe-top) + 32px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
      <div className="relative flex flex-col items-center pb-8 pt-2 text-center">
        <div className="absolute inset-x-0 top-6 mx-auto h-28 w-64 rounded-[50%] bg-gradient-to-b from-orange-100 to-transparent dark:from-noche-800" />
        <div className="relative flex items-end gap-1">
          <Person look={PRESETS.diego} stage={1} mood="love" size={84} />
          <Person look={PRESETS.maite} stage={1} mood="love" size={80} />
        </div>
        <h1 className="mt-4 text-[28px] font-bold tracking-[-0.035em]">Gymaiego</h1>
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
