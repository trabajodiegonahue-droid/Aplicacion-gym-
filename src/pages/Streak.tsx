import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertTriangle, Settings2, History, LifeBuoy, Trophy, CalendarCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { supabase, must } from '../lib/supabase'
import { rulesFor, useAction, useMemberDays, useProposals, useRules, useStreak, useStreakDays, useToday } from '../lib/queries'
import { addDays, diffDays, endOfMonth, fmtMonth, fmtShort, parseISODate, startOfMonth, startOfWeek, WEEKDAYS_MON, WEEKDAYS } from '../lib/dates'
import { Button, Card, Empty, ProgressBar, SectionTitle, cx, useUi } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { Flame } from '../components/Flame'
import { MemberToday, StatusChip, conditionText } from '../components/Today'
import { useMyAndPartnerToday } from './Home'
import type { CoupleDayStatus } from '../lib/types'

const DAY_COLORS: Record<CoupleDayStatus, string> = {
  completed: 'bg-gradient-to-br from-fuego-500 to-rosa-400 text-white',
  rest: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  recovered: 'bg-violet-300 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  missed: 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  in_progress: 'bg-amber-100 text-amber-800 ring-2 ring-amber-300 dark:bg-amber-950 dark:text-amber-200',
  pending: 'bg-white text-fuego-800 ring-1 ring-fuego-200 dark:bg-noche-800 dark:text-fuego-100 dark:ring-noche-700',
}

export default function Streak() {
  const { couple, profile, partner, uid } = useAuth()
  const nav = useNavigate()
  const { confirm } = useUi()
  const today = useToday()
  const streak = useStreak().data
  const rulesAll = useRules().data
  const current = rulesFor(rulesAll, today)
  const upcoming = rulesAll?.find(r => today && r.effective_from > today)
  const proposals = useProposals().data ?? []
  const { mine, theirs } = useMyAndPartnerToday()
  const [month, setMonth] = useState<string | null>(null)
  const m = month ?? (today ? startOfMonth(today) : null)
  const days = useStreakDays(m ? addDays(m, -7) : null, m ? endOfMonth(m) : null).data ?? []
  const ws = today ? startOfWeek(today) : null
  const weekDays = useMemberDays(ws, ws ? addDays(ws, 6) : null).data ?? []
  const runs = useQuery({
    queryKey: ['runs', couple?.id],
    enabled: !!couple,
    queryFn: () => must(supabase.rpc('streak_runs')) as Promise<{ start_day: string; end_day: string; length: number }[]>,
  }).data ?? []
  const recentMissed = useStreakDays(today ? addDays(today, -4) : null, today).data?.filter(d => d.status === 'missed' && d.finalized) ?? []

  const propose = useAction(async (day: string) => must(supabase.rpc('propose_change', { p_kind: 'streak_recovery', p_title: `Recuperar la racha del ${fmtShort(day)}`, p_payload: { day } })),
    { invalidate: [['proposals']], success: 'Propuesta enviada. Tu pareja debe aprobarla.' })

  const grid = useMemo(() => {
    if (!m) return []
    const first = parseISODate(m)
    const offset = (first.getDay() + 6) % 7
    const end = endOfMonth(m)
    const cells: (string | null)[] = Array(offset).fill(null)
    for (let d = m; d <= end; d = addDays(d, 1)) cells.push(d)
    return cells
  }, [m])

  if (!couple) return (
    <div><PageHeader title="Racha" />
      <Empty icon="🔥" title="La racha es de a dos" text="Vincula a tu pareja para empezar su racha compartida." action={<Button onClick={() => nav('/vincular')}>Vincular pareja</Button>} />
    </div>
  )

  const rules = current?.rules
  const myEnd = mine?.details.day_end ? new Date(mine.details.day_end) : null
  const hoursLeft = myEnd ? (myEnd.getTime() - Date.now()) / 3600000 : 99
  const danger = mine && !['completed', 'rest'].includes(mine.status) && hoursLeft < 4 && hoursLeft > 0
  const partnerDanger = theirs && !['completed', 'rest'].includes(theirs.status) && (mine?.status === 'completed' || mine?.status === 'rest')
  const sum = (u?: string) => weekDays.filter(d => d.user_id === u).reduce((s, d) => s + (d.details.workouts ?? 0), 0)
  const target = rules?.weekly_workouts_target ?? 0
  const daysLeftWeek = ws && today ? 6 - diffDays(today, ws) : 0
  const pendingMine = proposals.filter(p => p.status === 'pending')

  return (
    <div>
      <PageHeader title="Racha" subtitle={couple.name ?? 'Su llama compartida'}
        right={<Link to="/racha/reglas" className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm dark:bg-noche-800" aria-label="Reglas"><Settings2 className="size-5" /></Link>} />
      <div className="space-y-4 px-4">
        <Card className="flex flex-col items-center py-6 text-center">
          <Flame size={150} lit={(streak?.current_count ?? 0) > 0 || mine?.status === 'completed'} intensity={Math.min(1, (streak?.current_count ?? 0) / 30)} />
          <p className="mt-1 text-7xl font-black leading-none tracking-tighter text-fuego-600 dark:text-fuego-300">{streak?.current_count ?? 0}</p>
          <p className="font-bold">{(streak?.current_count ?? 0) === 1 ? 'día seguido' : 'días seguidos'} juntos</p>
          <div className="mt-3 flex gap-2">
            <span className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100"><Trophy className="size-3.5" />Récord: {streak?.best_count ?? 0}</span>
            <span className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100"><CalendarCheck className="size-3.5" />Desde {fmtShort(couple.streak_start_date)}</span>
          </div>
        </Card>

        {danger && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-600 p-4 text-white shadow-lg animate-pop">
            <AlertTriangle className="mt-0.5 size-6 shrink-0" />
            <div><p className="font-bold">¡La racha está en peligro!</p><p className="text-sm opacity-90">Te quedan {Math.max(0, Math.floor(hoursLeft))} h {Math.round((hoursLeft % 1) * 60)} min para cumplir hoy.</p></div>
          </div>
        )}
        {!danger && partnerDanger && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-100 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-6 shrink-0" />
            <div className="flex-1"><p className="font-bold">{partner?.display_name} aún no cumplió</p><p className="text-sm">Un mensaje de ánimo puede salvar la racha 💌</p></div>
            <Button variant="soft" className="min-h-10 px-3 text-sm" onClick={() => nav('/pareja')}>Animar</Button>
          </div>
        )}

        <Card>
          <p className="mb-3 font-bold">Hoy</p>
          <div className="flex gap-2">
            <MemberToday row={mine} name={profile?.display_name ?? 'Tú'} avatar={profile?.avatar_path} me />
            <MemberToday row={theirs} name={partner?.display_name ?? 'Pareja'} avatar={partner?.avatar_path} />
          </div>
          {rules && <p className="muted mt-3 text-sm"><b>Para sumar a la racha:</b> {conditionText(rules)}.</p>}
        </Card>

        {target > 0 && (
          <Card>
            <div className="flex items-center justify-between"><p className="font-bold">Meta semanal</p><span className="muted text-sm">quedan {daysLeftWeek} día(s)</span></div>
            {[{ id: uid!, name: 'Tú' }, { id: partner?.id, name: partner?.display_name ?? 'Pareja' }].map(p => (
              <div key={p.name} className="mt-3">
                <div className="flex justify-between text-sm"><span>{p.name}</span><span className="font-bold">{sum(p.id)} / {target}</span></div>
                <ProgressBar className="mt-1" value={sum(p.id)} max={target} />
              </div>
            ))}
          </Card>
        )}

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <button className="flex size-10 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" onClick={() => m && setMonth(startOfMonth(addDays(m, -1)))} aria-label="Mes anterior"><ChevronLeft className="size-5" /></button>
            <p className="font-bold capitalize">{m ? fmtMonth(m) : ''}</p>
            <button className="flex size-10 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" onClick={() => m && setMonth(addDays(endOfMonth(m), 1))} aria-label="Mes siguiente"><ChevronRight className="size-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS_MON.map(d => <span key={d} className="muted text-xs font-bold">{d}</span>)}
            {grid.map((d, i) => {
              if (!d) return <span key={i} />
              const sd = days.find(x => x.day === d)
              const isToday = d === today
              return (
                <div key={d} className={cx('flex aspect-square items-center justify-center rounded-xl text-sm font-bold',
                  sd ? DAY_COLORS[sd.status] : 'text-fuego-900/30 dark:text-fuego-100/25', isToday && 'outline-2 outline-offset-2 outline-fuego-500')}>
                  {sd?.status === 'completed' ? '🔥' : Number(d.slice(8))}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['completed', 'rest', 'recovered', 'in_progress', 'missed'] as const).map(s => <StatusChip key={s} status={s} />)}
          </div>
        </Card>

        {recentMissed.length > 0 && (rules?.recovery_per_month ?? 0) > 0 && (
          <Card>
            <div className="flex items-center gap-2"><LifeBuoy className="size-5 text-violet-500" /><p className="font-bold">Recuperar la racha</p></div>
            <p className="muted mt-1 text-sm">Pueden recuperar hasta {rules?.recovery_per_month} día(s) al mes, en los 3 días siguientes, si los dos están de acuerdo.</p>
            <div className="mt-3 space-y-2">
              {recentMissed.map(d => (
                <div key={d.day} className="flex items-center justify-between rounded-xl bg-fuego-50 p-3 dark:bg-noche-900">
                  <span className="font-semibold capitalize">{WEEKDAYS[parseISODate(d.day).getDay()]} {fmtShort(d.day)}</span>
                  <Button variant="soft" className="min-h-10 text-sm" loading={propose.isPending}
                    disabled={pendingMine.some(p => p.kind === 'streak_recovery' && (p.payload as { day?: string }).day === d.day)}
                    onClick={async () => { if (await confirm({ title: 'Proponer recuperación', text: 'Tu pareja recibirá la propuesta y deberá aprobarla.' })) propose.mutate(d.day) }}>Proponer</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <SectionTitle action={<Link to="/racha/reglas" className="text-sm font-semibold text-fuego-600">Cambiar</Link>}>Reglas actuales</SectionTitle>
        {rules && current && (
          <Card>
            <p className="text-sm">{conditionText(rules)}</p>
            <ul className="muted mt-2 space-y-1 text-sm">
              <li>• Descansos personales: {rules.rest_days_per_week} por semana</li>
              {rules.rest_weekdays.length > 0 && <li>• Descanso compartido: {rules.rest_weekdays.map(d => WEEKDAYS[d]).join(', ')}</li>}
              <li>• Cierre del día: {rules.day_cutoff_minutes === 0 ? 'medianoche' : `${String(Math.floor(rules.day_cutoff_minutes / 60)).padStart(2, '0')}:${String(rules.day_cutoff_minutes % 60).padStart(2, '0')} del día siguiente`} (hora local de cada uno)</li>
              <li>• Recuperaciones: {rules.recovery_per_month} al mes</li>
              {rules.special_rules && <li>• {rules.special_rules}</li>}
            </ul>
            <p className="muted mt-2 text-xs">Versión {current.version} · vigente desde {fmtShort(current.effective_from)}</p>
            {upcoming && <p className="mt-2 rounded-xl bg-fuego-100 p-2 text-xs font-semibold text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">Nuevas reglas (v{upcoming.version}) empiezan el {fmtShort(upcoming.effective_from)}.</p>}
          </Card>
        )}
        {pendingMine.length > 0 && (
          <Card onClick={() => nav('/propuestas')} className="flex items-center justify-between">
            <span className="font-semibold">{pendingMine.length} propuesta(s) pendiente(s)</span><ChevronRight />
          </Card>
        )}

        <SectionTitle>Historial de rachas</SectionTitle>
        <Card>
          {runs.length === 0 ? <p className="muted text-sm">Cuando completen su primer día juntos aparecerá aquí.</p> : (
            <ul className="space-y-2">
              {runs.map((r, i) => (
                <li key={i} className="flex items-center gap-3">
                  <History className="size-4 text-fuego-400" />
                  <span className="flex-1 text-sm">{fmtShort(r.start_day)} → {fmtShort(r.end_day)}</span>
                  <span className="font-bold">{r.length} 🔥</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="h-4" />
      </div>
    </div>
  )
}
