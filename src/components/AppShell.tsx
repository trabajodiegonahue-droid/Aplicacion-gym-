import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Flame as FlameIcon, Dumbbell, ListChecks, Heart } from 'lucide-react'
import { cx, Loading } from './ui'
import { useEnsureToday, useRealtimeSync } from '../lib/queries'
import { InstallBanner } from './InstallBanner'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/racha', label: 'Racha', icon: FlameIcon },
  { to: '/gym', label: 'Gimnasio', icon: Dumbbell },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks },
  { to: '/pareja', label: 'Pareja', icon: Heart },
]

export function AppShell() {
  useRealtimeSync()
  useEnsureToday()
  const loc = useLocation()
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="pb-nav" style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
        <InstallBanner />
        <Suspense fallback={<Loading />}>
          <div key={loc.pathname.split('/')[1]} className="animate-rise"><Outlet /></div>
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-fuego-100 bg-white/85 backdrop-blur-xl dark:border-noche-700 dark:bg-noche-900/85"
        style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cx('flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition',
                isActive ? 'text-fuego-500' : 'text-fuego-900/45 dark:text-fuego-100/45')}>
              {({ isActive }) => (<>
                <t.icon className={cx('size-6 transition', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 2} />
                {t.label}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Cabecera de página con espacio para la Dynamic Island / notch. */
export function PageHeader({ title, subtitle, right, back }: { title: string; subtitle?: string; right?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-30 bg-fuego-50/85 px-4 pb-3 backdrop-blur-xl dark:bg-noche-900/85">
      <div className="flex min-h-12 items-center gap-3 pt-2">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="muted truncate text-sm">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}
