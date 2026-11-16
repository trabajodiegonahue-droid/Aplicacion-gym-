import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plane, ChevronRight } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useToday } from '../lib/queries'
import { diffDays, fmtLongDay } from '../lib/dates'
import { Button, Card, ProgressBar } from './ui'

interface Visit { id: string; title: string; event_date: string; end_date: string | null }

/** Cuenta regresiva para la próxima visita (eventos de tipo "Visita" del calendario). */
export function VisitCountdown() {
  const { couple } = useAuth()
  const today = useToday()
  const nav = useNavigate()
  const visits = useQuery({
    queryKey: ['calendar', 'visits', couple?.id], enabled: !!couple,
    queryFn: () => must(supabase.from('calendar_events').select('id, title, event_date, end_date').eq('couple_id', couple!.id).eq('kind', 'visita').order('event_date')) as Promise<Visit[]>,
  }).data ?? []
  if (!couple || !today) return null
  const now = visits.find(v => v.event_date <= today && (v.end_date ?? v.event_date) >= today)
  const next = visits.find(v => v.event_date > today)
  const prev = [...visits].reverse().find(v => (v.end_date ?? v.event_date) < today)
  if (now) return (
    <Card className="flex items-center gap-3 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-fuego-500/15" data-testid="visit-card">
      <span className="text-[30px] heartbeat">💞</span>
      <div><p className="text-[16px] font-bold">¡Están juntos!</p><p className="muted text-[13px]">{now.title}. Disfruten y entrenen juntos: márquenlo como "entreno juntos".</p></div>
    </Card>
  )
  if (!next) return (
    <Card onClick={() => nav('/calendario')} className="flex items-center gap-3" data-testid="visit-card">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950"><Plane className="size-5" /></span>
      <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">¿Cuándo se vuelven a ver?</p><p className="muted text-[13px]">Agreguen la próxima visita al calendario y verán la cuenta regresiva.</p></div>
      <ChevronRight className="size-5 text-fuego-800/40" />
    </Card>
  )
  const left = diffDays(next.event_date, today)
  const span = prev ? diffDays(next.event_date, prev.end_date ?? prev.event_date) : Math.max(left, 30)
  return (
    <Card className="overflow-hidden" data-testid="visit-card">
      <div className="flex items-center gap-3">
        <span className="float-soft flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-sm"><Plane className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-sky-700 dark:text-sky-300">{next.title}</p>
          <p className="font-display text-[26px] font-bold leading-tight">{left === 1 ? '¡Mañana se ven! 💞' : <>Faltan <span className="text-gradient">{left}</span> días</>}</p>
          <p className="muted text-[12.5px] first-letter:uppercase">{fmtLongDay(next.event_date)}</p>
        </div>
      </div>
      <ProgressBar className="mt-3" value={span - left} max={span} color="bg-gradient-to-r from-sky-400 to-indigo-500" label={<span className="muted text-[11.5px]">{prev ? 'Desde la última visita' : 'Cuenta regresiva'}</span>} showPct />
      <Button variant="soft" className="mt-3 w-full min-h-10 text-[13.5px]" onClick={() => nav('/habitos/retos', { state: { template: 'visita', end: next.event_date } })}>🏆 Reto para llegar en forma al reencuentro</Button>
    </Card>
  )
}
