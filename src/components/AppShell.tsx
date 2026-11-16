import { Suspense, useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { House, Flame as FlameIcon, Dumbbell, CircleCheckBig, Heart } from 'lucide-react'
import { cx, Loading } from './ui'
import { useEnsureToday, useRealtimeSync } from '../lib/queries'
import { InstallBanner } from './InstallBanner'
import { DemoBar } from '../demo/DemoBar'
import { ErrorBoundary } from './ErrorBoundary'
import { OfflineBanner } from './OfflineBanner'
import { Onboarding } from './Onboarding'
import { isDemo } from '../lib/supabase'

const tabs = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/racha', label: 'Racha', icon: FlameIcon },
  { to: '/gym', label: 'Gimnasio', icon: Dumbbell },
  { to: '/habitos', label: 'Hábitos', icon: CircleCheckBig },
  { to: '/pareja', label: 'Pareja', icon: Heart },
]

export function AppShell() {
  useRealtimeSync()
  useEnsureToday()
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => { const h = () => nav('/'); window.addEventListener('fj-go-home', h); return () => window.removeEventListener('fj-go-home', h) }, [nav])
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {!isDemo && <OfflineBanner />}
      <Onboarding />
      <main className="pb-nav" style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
        {isDemo ? <DemoBar /> : <InstallBanner />}
        <Suspense fallback={<Loading />}>
          <ErrorBoundary resetKey={loc.pathname}>
            <div key={loc.pathname.split('/')[1]} className="animate-rise"><Outlet /></div>
          </ErrorBoundary>
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[.06] bg-fuego-50/80 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[.06] dark:bg-noche-900/80"
        style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-5 px-2">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cx('relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight transition-colors',
                isActive ? 'text-ink dark:text-white' : 'text-fuego-800/55 dark:text-white/40')}>
              {({ isActive }) => (<>
                <t.icon className="size-[23px]" strokeWidth={isActive ? 2.1 : 1.7} />
                {t.label}
                <span className={cx('absolute top-1.5 size-1 rounded-full bg-ember transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Cabecera de página estilo iOS (título grande), respeta Dynamic Island / notch. */
export function PageHeader({ title, subtitle, right, back }: { title: string; subtitle?: string; right?: ReactNode; back?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-30 bg-fuego-50/80 px-5 pb-3 backdrop-blur-2xl backdrop-saturate-150 dark:bg-noche-900/80">
      <div className="flex min-h-12 items-end gap-3 pt-3">
        {back}
        <div className="min-w-0 flex-1">
          {subtitle && <p className="eyebrow mb-0.5 truncate">{subtitle}</p>}
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="icon-btn mb-1" aria-label="Volver"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
}
