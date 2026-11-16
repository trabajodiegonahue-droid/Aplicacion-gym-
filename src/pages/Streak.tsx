import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, TriangleAlert, SlidersHorizontal, LifeBuoy, Lock, Check, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { supabase, must } from '../lib/supabase'
import { rulesFor, useAction, useMemberDays, useProposals, useRules, useStreak, useStreakDays, useToday } from '../lib/queries'
import { addDays, diffDays, endOfMonth, fmtMonth, fmtShort, parseISODate, startOfMonth, startOfWeek, WEEKDAYS_MON, WEEKDAYS } from '../lib/dates'
import { Button, Card, Empty, ProgressBar, SectionTitle, cx, useUi } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { Flame } from '../components/Flame'
import { PartnerRing, conditionText } from '../components/Today'
import { WeekStrip, useMyAndPartnerToday } from './Home'

export const MILESTONES = [
  { days: 3, name: 'Chispa' }, { days: 7, name: 'Una semana' }, { days: 14, name: 'Dos semanas' }, { days: 30, name: 'Un mes' },
  { days: 50, name: 'Imparables' }, { days: 100, name: 'Centenario' }, { days: 200, name: 'Leyenda' }, { days: 365, name: 'Un año juntos' },
]

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
  const weekStreak = useStreakDays(ws, ws ? addDays(ws, 6) : null).data ?? []
  const weekDays = useMemberDays(ws, ws ? addDays(ws, 6) : null).data ?? []
  const runs = useQuery({
    queryKey: ['runs', couple?.id],
    enabled: !!couple,
    queryFn: () => must(supabase.rpc('streak_runs')) as Promise<{ start_day: string; end_day: string; length: number }[]>,
  }).data ?? []
  const recentMissed = useStreakDays(today ? addDays(today, -4) : null, today).data?.filter(d => d.status === 'missed' && d.finalized) ?? []
  const propose = useAction(async (day: string) => must(supabase.rpc('propose_change', { p_kind: 'streak_recovery', p_title: `Recuperar la racha del ${fmtShort(day)}`, p_payload: { day } })),
    { invalidate: [['proposals']], success: 'Propuesta enviada a tu pareja' })

  const grid = useMemo(() => {
    if (!m) return []
    const cells: (string | null)[] = Array((parseISODate(m).getDay() + 6) % 7).fill(null)
    for (let d = m; d <= endOfMonth(m); d = addDays(d, 1)) cells.push(d)
    return cells
  }, [m])

  if (!couple) return (
    <div><PageHeader title="Racha" />
      <Empty icon={<Flame size={34} lit={false} />} title="La racha es de a dos" text="Vincula a tu pareja para empezar su racha compartida." action={<Button onClick={() => nav('/vincular')}>Vincular pareja</Button>} />
    </div>
  )

  const rules = current?.rules
  const count = streak?.current_count ?? 0
  const best = streak?.best_count ?? 0
  const myEnd = mine?.details.day_end ? new Date(mine.details.day_end) : null
  const hoursLeft = myEnd ? (myEnd.getTime() - Date.now()) / 3600000 : 99
  const danger = mine && !['completed', 'rest'].includes(mine.status) && hoursLeft < 4 && hoursLeft > 0
  const partnerPending = theirs && !['completed', 'rest'].includes(theirs.status) && (mine?.status === 'completed' || mine?.status === 'rest')
  const sum = (u?: string) => weekDays.filter(d => d.user_id === u).reduce((s, d) => s + (d.details.workouts ?? 0), 0)
  const target = rules?.weekly_workouts_target ?? 0
  const daysLeftWeek = ws && today ? 6 - diffDays(today, ws) : 0
  const pending = proposals.filter(p => p.status === 'pending')
  const next = MILESTONES.find(x => x.days > count)

  return (
    <div>
      <PageHeader title="Racha" subtitle={couple.name ?? 'Su llama compartida'}
        right={<Link to="/racha/reglas" className="icon-btn mb-1" aria-label="Reglas"><SlidersHorizontal className="size-[18px]" strokeWidth={1.9} /></Link>} />
      <div className="space-y-3 px-4">
        <div className="relative overflow-hidden rounded-[26px] bg-ink px-5 pb-5 pt-7 text-center text-white dark:bg-noche-800 dark:ring-1 dark:ring-white/[.06]">
          <div className="pointer-events-none absolute left-1/2 top-0 size-64 -translate-x-1/2 rounded-full bg-ember opacity-20 blur-3xl" />
          <div className="relative flex flex-col items-center">
            <Flame size={120} lit={count > 0 || mine?.status === 'completed'} intensity={Math.min(1, count / 30)} />
            <p className="tabular mt-1 text-[80px] font-bold leading-none tracking-[-0.06em]">{count}</p>
            <p className="mt-1 text-[14px] text-white/60">{count === 1 ? 'día seguido juntos' : 'días seguidos juntos'}</p>
            <div className="mt-5 grid w-full grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[.06] py-3">
              <div><p className="tabular text-[20px] font-semibold">{best}</p><p className="text-[11px] text-white/45">Récord</p></div>
              <div><p className="tabular text-[20px] font-semibold">{runs.length}</p><p className="text-[11px] text-white/45">Rachas</p></div>
              <div><p className="tabular text-[20px] font-semibold">{diffDays(today ?? couple.streak_start_date, couple.streak_start_date) + 1}</p><p className="text-[11px] text-white/45">Días juntos aquí</p></div>
            </div>
            <div className="mt-4 w-full"><WeekStrip today={today} days={weekStreak} dark /></div>
          </div>
        </div>

        {danger && (
          <div className="flex items-start gap-3 rounded-[20px] bg-red-600 p-4 text-white animate-pop">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <div><p className="text-[15px] font-semibold">La racha está en peligro</p><p className="text-[13px] text-white/85">Te quedan {Math.max(0, Math.floor(hoursLeft))} h {Math.round((hoursLeft % 1) * 60)} min para cumplir hoy.</p></div>
          </div>
        )}
        {!danger && partnerPending && (
          <Card className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><TriangleAlert className="size-5" /></span>
            <div className="flex-1"><p className="text-[15px] font-semibold">{partner?.display_name} aún no cumplió</p><p className="muted text-[13px]">Un mensaje puede salvar la racha.</p></div>
            <Button variant="soft" className="min-h-9 px-3 text-[13px]" onClick={() => nav('/pareja')}>Escribir</Button>
          </Card>
        )}

        <SectionTitle>Hoy</SectionTitle>
        <Card className="py-5">
          <div className="flex">
            <PartnerRing row={mine} rules={rules} name={profile?.display_name ?? 'Tú'} avatar={profile?.avatar_path} me size={96} />
            <PartnerRing row={theirs} rules={rules} name={partner?.display_name ?? 'Pareja'} avatar={partner?.avatar_path} size={96} />
          </div>
          {rules && <p className="muted mt-4 border-t border-black/[.05] pt-3 text-center text-[13px] dark:border-white/[.06]">Para sumar: {conditionText(rules).toLowerCase()}</p>}
        </Card>

        <SectionTitle>Logros</SectionTitle>
        <Card>
          {next && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between"><p className="text-[15px] font-semibold">Próximo: {next.name}</p><span className="tabular muted text-[13px]">{count} / {next.days}</span></div>
              <ProgressBar className="mt-2" value={count} max={next.days} />
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map(x => {
              const got = best >= x.days
              return (
                <div key={x.days} className="flex flex-col items-center gap-1.5 text-center">
                  <span className={cx('relative flex size-14 items-center justify-center rounded-full', got ? 'bg-ember text-white shadow-[0_6px_16px_-6px_rgba(225,29,72,.6)]' : 'bg-fuego-100 text-fuego-800/35 dark:bg-noche-700 dark:text-white/25')}>
                    <span className="tabular text-[17px] font-bold">{x.days}</span>
                    {!got && <Lock className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-white p-0.5 text-fuego-800/50 dark:bg-noche-800" />}
                  </span>
                  <span className={cx('text-[11px] font-medium leading-tight', !got && 'muted')}>{x.name}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {target > 0 && (
          <>
            <SectionTitle action={<span className="muted text-[12px]">quedan {daysLeftWeek} día(s)</span>}>Meta semanal</SectionTitle>
            <Card className="space-y-3">
              {[{ id: uid!, name: 'Tú' }, { id: partner?.id, name: partner?.display_name ?? 'Pareja' }].map(p => (
                <div key={p.name}>
                  <div className="flex justify-between text-[14px]"><span>{p.name}</span><span className="tabular font-semibold">{sum(p.id)} / {target} entrenos</span></div>
                  <ProgressBar className="mt-2" value={sum(p.id)} max={target} />
                </div>
              ))}
            </Card>
          </>
        )}

        <SectionTitle>Calendario</SectionTitle>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button className="icon-btn size-9" onClick={() => m && setMonth(startOfMonth(addDays(m, -1)))} aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
            <p className="text-[15px] font-semibold first-letter:uppercase">{m ? fmtMonth(m) : ''}</p>
            <button className="icon-btn size-9" onClick={() => m && setMonth(addDays(endOfMonth(m), 1))} aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-y-1.5 text-center">
            {WEEKDAYS_MON.map(d => <span key={d} className="muted pb-1 text-[11px] font-medium">{d}</span>)}
            {grid.map((d, i) => {
              if (!d) return <span key={i} />
              const st = days.find(x => x.day === d)?.status
              return (
                <div key={d} className="flex justify-center">
                  <span className={cx('flex size-9 items-center justify-center rounded-full text-[13px] font-medium tabular',
                    st === 'completed' ? 'bg-ember text-white'
                      : st === 'rest' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : st === 'recovered' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                      : st === 'missed' ? 'text-fuego-800/35 line-through dark:text-white/25'
                      : st === 'in_progress' ? 'ring-1 ring-amber-400'
                      : 'text-fuego-800/60 dark:text-white/50',
                    d === today && st !== 'completed' && 'ring-1 ring-ink dark:ring-white')}>
                    {st === 'rest' ? <Moon className="size-3.5" /> : Number(d.slice(8))}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="muted mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ember" />Cumplido</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-300" />Descanso</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-violet-300" />Recuperado</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full ring-1 ring-amber-400" />En curso</span>
          </div>
        </Card>

        {recentMissed.length > 0 && (rules?.recovery_per_month ?? 0) > 0 && (
          <Card>
            <div className="flex items-center gap-2"><LifeBuoy className="size-5 text-violet-500" strokeWidth={1.8} /><p className="text-[15px] font-semibold">Recuperar la racha</p></div>
            <p className="muted mt-1 text-[13px]">Hasta {rules?.recovery_per_month} día(s) al mes, dentro de los 3 días siguientes y con el acuerdo de ambos.</p>
            <div className="mt-3 divide-y divide-black/[.05] dark:divide-white/[.06]">
              {recentMissed.map(d => (
                <div key={d.day} className="flex items-center justify-between py-2">
                  <span className="text-[15px] first-letter:uppercase">{WEEKDAYS[parseISODate(d.day).getDay()]} {fmtShort(d.day)}</span>
                  <Button variant="soft" className="min-h-9 px-3 text-[13px]" loading={propose.isPending}
                    disabled={pending.some(p => p.kind === 'streak_recovery' && (p.payload as { day?: string }).day === d.day)}
                    onClick={async () => { if (await confirm({ title: 'Proponer recuperación', text: 'Tu pareja recibirá la propuesta y deberá aprobarla.' })) propose.mutate(d.day) }}>Proponer</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <SectionTitle action={<Link to="/racha/reglas" className="text-[13px] font-medium text-ember">Proponer cambio</Link>}>Reglas</SectionTitle>
        {rules && current && (
          <Card className="divide-y divide-black/[.05] p-0 text-[14px] dark:divide-white/[.06]">
            {[
              ['Para cumplir', conditionText(rules)],
              ['Descansos personales', `${rules.rest_days_per_week} por semana`],
              ...(rules.rest_weekdays.length ? [['Descanso compartido', rules.rest_weekdays.map(d => WEEKDAYS[d]).join(', ')]] : []),
              ['Cierre del día', rules.day_cutoff_minutes === 0 ? 'Medianoche' : `${String(Math.floor(rules.day_cutoff_minutes / 60)).padStart(2, '0')}:${String(rules.day_cutoff_minutes % 60).padStart(2, '0')} (día siguiente)`],
              ['Recuperaciones', `${rules.recovery_per_month} al mes`],
              ...(rules.special_rules ? [['Especiales', rules.special_rules]] : []),
              ['Versión', `v${current.version} · desde ${fmtShort(current.effective_from)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4 px-4 py-3"><span className="muted w-32 shrink-0">{k}</span><span className="flex-1 text-right">{v}</span></div>
            ))}
            {upcoming && <p className="bg-blush px-4 py-3 text-[13px] font-medium text-ember dark:bg-noche-700">Nuevas reglas (v{upcoming.version}) desde el {fmtShort(upcoming.effective_from)}.</p>}
          </Card>
        )}
        {pending.length > 0 && (
          <Card onClick={() => nav('/propuestas')} className="flex items-center justify-between">
            <span className="text-[15px] font-medium">{pending.length} propuesta(s) pendiente(s)</span><ChevronRight className="size-5 text-fuego-800/40" />
          </Card>
        )}

        <SectionTitle>Historial</SectionTitle>
        <Card className="p-0">
          {runs.length === 0 ? <p className="muted px-4 py-4 text-[14px]">Cuando completen su primer día juntos aparecerá aquí.</p> : (
            <ul className="divide-y divide-black/[.05] dark:divide-white/[.06]">
              {runs.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx('flex size-8 items-center justify-center rounded-full', i === 0 && count > 0 ? 'bg-ember text-white' : 'bg-fuego-100 text-fuego-800 dark:bg-noche-700 dark:text-white/70')}><Check className="size-4" strokeWidth={2.5} /></span>
                  <span className="flex-1 text-[14px]">{fmtShort(r.start_day)} — {fmtShort(r.end_day)}</span>
                  <span className="tabular text-[15px] font-semibold">{r.length} {r.length === 1 ? 'día' : 'días'}</span>
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
