import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Dumbbell, Droplets, Activity, Moon, ChevronRight, Vote, CircleCheckBig, Hand, ArrowUpRight, Link2, Check, CircleHelp, Snowflake, CalendarDays, Apple } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { supabase, must } from '../lib/supabase'
import { LOG_KEYS, rulesFor, useAction, useMemberDays, useNotifications, useProposals, useRules, useStreak, useStreakDays, useToday, useTodayWindow } from '../lib/queries'
import { addDays, fmtLiters, fmtLongDay, startOfWeek, WEEKDAYS_MON } from '../lib/dates'
import { Card, ProgressBar, SectionTitle, cx } from '../components/ui'
import { Flame } from '../components/Flame'
import { Avatar } from '../components/Avatar'
import { ActivitySheet, QuickWorkoutSheet, WaterSheet, conditionText, useAddWater, useWaterToday } from '../components/Today'
import { CoupleScene, LevelUpWatcher } from '../components/Characters'
import { startTour } from '../components/Tour'
import { GoalsHome } from '../components/Goals'
import { CountUp, Embers } from '../components/Motion'
import { WeeklySummary } from '../components/WeeklySummary'
import { DayOptionsSheet, PauseBanners } from '../components/DayOptions'
import { CheckInCard } from '../components/CheckIn'
import { WeighInCard } from '../components/BodyCheck'
import { NutritionSheet, PRODUCE_GOAL, useNutritionSummary } from '../components/Nutrition'
import { VisitCountdown } from '../components/VisitCountdown'
import { PartnerLiveCard } from '../components/Live'
import { PushPromptCard } from '../components/PushSetup'
import { JointInvites } from '../components/JointInvites'
import { useCoupleCalendar } from '../lib/life'
import { draftDoneSets, useWorkoutDraft } from './gym/workoutDraft'
import type { Habit, HabitLog, MemberDay, StreakDay } from '../lib/types'

const QUOTES = [
  'La constancia les gana a las ganas.',
  'Lejos en kilómetros, juntos en cada repetición.',
  'Un día a la vez, una llama para dos.',
  'No tiene que ser perfecto, tiene que ser hoy.',
  'Pequeños pasos, gran equipo.',
  'La distancia no apaga lo que alimentan todos los días.',
  'Hoy suma. Mañana también.',
]

export function useMyAndPartnerToday() {
  const { uid, partner } = useAuth()
  const { today, from, to } = useTodayWindow()
  const days = useMemberDays(from, to).data ?? []
  const mine = days.find(d => d.user_id === uid && d.day === today)
  const partnerRows = days.filter(d => d.user_id === partner?.id)
  const theirs: MemberDay | undefined = partnerRows.sort((a, b) => b.day.localeCompare(a.day)).find(d => !today || d.day <= addDays(today, 1))
  return { today, mine, theirs }
}

/** Tira de 7 días (lunes a domingo) con el estado de la racha. */
export function WeekStrip({ today, days, dark }: { today: string | null; days: StreakDay[]; dark?: boolean }) {
  if (!today) return null
  const ws = startOfWeek(today)
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(ws, i)
        const st = days.find(x => x.day === d)?.status
        const future = d > today
        return (
          <div key={d} className="flex flex-col items-center gap-1.5">
            <span className={cx('text-[11px] font-medium', dark ? 'text-white/75' : 'muted')}>{WEEKDAYS_MON[i]}</span>
            <span className={cx('flex size-8 items-center justify-center rounded-full text-[12px] font-semibold tabular transition',
              st === 'completed' ? (dark ? 'bg-white text-fuego-600 shadow-sm' : 'bg-ember text-white')
                : st === 'rest' || st === 'recovered' ? (dark ? 'bg-white/15 text-white' : 'bg-sky-100 text-sky-700')
                : st === 'paused' ? (dark ? 'bg-white/15 text-white' : 'bg-indigo-100 text-indigo-700')
                : st === 'missed' ? (dark ? 'text-white/40' : 'text-fuego-800/30')
                : future ? (dark ? 'text-white/45' : 'text-fuego-800/30')
                : (dark ? 'bg-white/20 text-white' : 'bg-fuego-100 text-ink'),
              d === today && st !== 'completed' && (dark ? 'ring-1 ring-white/60' : 'ring-1 ring-ink/40'))}>
              {st === 'completed' ? <Check className="size-4" strokeWidth={3} /> : st === 'rest' ? <Moon className="size-3.5" /> : st === 'paused' ? <Snowflake className="size-3.5" /> : Number(d.slice(8))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const { profile, couple, partner, uid } = useAuth()
  const nav = useNavigate()
  const draft = useWorkoutDraft()
  const addWater = useAddWater()
  const toggleHabit = useAction(async (v: { id: string; on: boolean }) => {
    if (v.on) await must(supabase.from('habit_logs').delete().eq('habit_id', v.id).eq('user_id', uid!).eq('local_day', today!))
    else await must(supabase.from('habit_logs').insert({ habit_id: v.id, user_id: uid }))
    return !v.on
  }, { invalidate: [['habit_logs'], ['week_summary'], ...LOG_KEYS], success: done => (done ? '¡Hábito cumplido! ✅' : 'Hábito desmarcado') })
  const today = useToday()
  const streak = useStreak().data
  const rulesAll = useRules().data
  const rules = rulesFor(rulesAll, today)?.rules
  const { mine, theirs } = useMyAndPartnerToday()
  const ws = today ? startOfWeek(today) : null
  const weekDays = useStreakDays(ws, ws ? addDays(ws, 6) : null).data ?? []
  const water = useWaterToday().data ?? 0
  const unread = (useNotifications().data ?? []).filter(n => !n.read_at).length
  const toApprove = (useProposals().data ?? []).filter(p => p.status === 'pending' && p.proposed_by !== uid)
  const [sheet, setSheet] = useState<null | 'workout' | 'water' | 'activity'>(null)
  const quote = useMemo(() => QUOTES[new Date().getDate() % QUOTES.length], [])

  const week = useQuery({
    queryKey: ['week_summary', uid, today],
    enabled: !!today,
    queryFn: async () => {
      const s = startOfWeek(today!)
      const [w, habits, logs] = await Promise.all([
        must(supabase.from('workouts').select('local_day').gte('local_day', s).lte('local_day', addDays(s, 6)).eq('user_id', uid!)),
        must(supabase.from('habits').select('*').eq('archived', false).eq('user_id', uid!)),
        must(supabase.from('habit_logs').select('habit_id, local_day').eq('local_day', today!).eq('user_id', uid!)),
      ])
      return { workouts: (w as { local_day: string }[]).length, habits: habits as Habit[], logs: logs as HabitLog[] }
    },
  })
  const dailyHabits = (week.data?.habits ?? []).filter(h => h.frequency === 'daily' && h.start_date <= (today ?? '') && (!h.end_date || h.end_date >= (today ?? '')))
  const habitsDone = dailyHabits.filter(h => week.data?.logs.some(l => l.habit_id === h.id)).length

  const [dayOpts, setDayOpts] = useState(false)
  const [food, setFood] = useState(false)
  const nutri = useNutritionSummary()
  const todayPlans = (useCoupleCalendar(today, today).data ?? []).filter(x => x.kind === 'plan')
  const nudgeKey = `fj-nudge-${today}`
  const [nudged, setNudged] = useState(() => { try { return localStorage.getItem(nudgeKey) === '1' } catch { return false } })
  const nudge = useAction(async () => must(supabase.from('messages').insert({ couple_id: couple!.id, sender_id: uid, kind: 'motivation', body: `👋 ${profile?.display_name ?? 'Tu pareja'} te da un toque: ¡vamos por la racha de hoy!` })),
    { invalidate: [['messages']], success: `Toque enviado a ${partner?.display_name ?? 'tu pareja'}` })

  const goal = profile?.water_goal_ml ?? 2500
  const done = (s?: string) => s === 'completed' || s === 'rest' || s === 'paused'
  const bothDone = done(mine?.status) && done(theirs?.status)
  const count = streak?.current_count ?? 0
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const status = bothDone ? 'Los dos cumplieron hoy. La llama sigue viva.'
    : done(mine?.status) ? `Falta ${partner?.display_name ?? 'tu pareja'} para sumar el día.`
    : done(theirs?.status) ? `${partner?.display_name ?? 'Tu pareja'} ya cumplió. Te toca a ti.`
    : rules ? `Para sumar: ${conditionText(rules).toLowerCase()}.` : 'Registren su actividad de hoy.'

  return (
    <div>
      <header className="safe-top flex items-end gap-2 px-5 pb-4 pt-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow first-letter:uppercase">{today ? fmtLongDay(today) : ' '}</p>
          <h1 className="mt-1 leading-tight"><span className="block text-[17px] font-medium text-fuego-800/80 dark:text-white/60">{greet},</span><span className="font-display text-gradient truncate text-[34px] font-semibold">{profile?.display_name?.split(' ')[0] ?? ''}</span> <span className="inline-block origin-[70%_70%] animate-[wave_2.4s_ease-in-out_1] text-[26px]">👋</span></h1>
        </div>
        <Link to="/calendario" data-tour="calendar" className="icon-btn mb-1" aria-label="Calendario de los dos"><CalendarDays className="size-[18px]" strokeWidth={1.9} /></Link>
        <button onClick={startTour} className="icon-btn mb-1" aria-label="Cómo funciona la app"><CircleHelp className="size-[18px]" strokeWidth={1.9} /></button>
        <Link to="/notificaciones" data-tour="bell" className="icon-btn relative mb-1" aria-label="Notificaciones">
          <Bell className="size-[18px]" strokeWidth={1.9} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-white ring-2 ring-fuego-50 dark:ring-noche-900">{unread > 9 ? '9+' : unread}</span>}
        </Link>
        <Link to="/perfil" aria-label="Perfil" className="mb-1" data-tour="profile"><Avatar path={profile?.avatar_path} name={profile?.display_name} size={40} /></Link>
      </header>

      <div className="stagger space-y-3 px-4">
        <PartnerLiveCard />
        <PushPromptCard />
        {!couple && (
          <Card onClick={() => nav('/vincular')} className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blush text-ember dark:bg-noche-700"><Link2 className="size-5" /></span>
            <div className="flex-1">
              <p className="text-[15px] font-semibold">Vincula a tu pareja</p>
              <p className="muted text-[13px]">La racha compartida empieza cuando estén los dos.</p>
            </div>
            <ChevronRight className="size-5 text-fuego-800/40" />
          </Card>
        )}

        {couple && (
          <>
            {/* Tarjeta principal de la racha */}
            <button data-tour="streak" onClick={() => nav('/racha')} className="relative block w-full overflow-hidden rounded-[26px] bg-gradient-to-br from-orange-400 via-fuego-400 to-fuego-600 p-5 text-left text-white shadow-[0_20px_40px_-18px_rgba(225,29,72,.55)] transition active:scale-[.99]">
              <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-amber-200 opacity-30 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full bg-rose-900 opacity-25 blur-3xl" />
              {count > 0 && <Embers count={12} />}
              <div className="relative flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[12px] font-medium uppercase tracking-[.08em] text-white/80">Racha compartida</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <CountUp value={count} className="tabular font-display text-[68px] font-bold leading-none" /><span data-testid="streak-count" className="sr-only">{count}</span>
                    <span className="text-[15px] font-medium text-white/70">{count === 1 ? 'día' : 'días'}</span>
                  </p>
                  <p className="mt-1.5 text-[13px] text-white/80">Récord {streak?.best_count ?? 0} · {couple.name ?? `Tú y ${partner?.display_name ?? ''}`}</p>
                </div>
                <div className="float-soft rounded-full bg-white/20 p-2"><Flame size={80} lit intensity={Math.min(1, count / 30)} /></div>
              </div>
              <div className="relative mt-5 border-t border-white/20 pt-4"><WeekStrip today={today} days={weekDays} dark /></div>
              <ArrowUpRight className="absolute right-4 top-4 size-4 text-white/30" />
            </button>

            {/* Hoy: los dos personajes */}
            <CoupleScene mine={mine} theirs={theirs} rules={rules}>
              <p className={cx('mx-auto max-w-[300px] text-center text-[13.5px] leading-snug', bothDone ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'muted')}>{status}</p>
              {!done(theirs?.status) && (
                <button data-tour="nudge" disabled={nudged || nudge.isPending}
                  onClick={() => nudge.mutate(undefined, { onSuccess: () => { setNudged(true); try { localStorage.setItem(nudgeKey, '1') } catch { /* */ } } })}
                  className="mx-auto mt-3 flex min-h-10 items-center gap-2 rounded-full bg-fuego-100 px-4 text-[13px] font-semibold text-ink transition active:scale-95 disabled:opacity-45 dark:bg-noche-700 dark:text-white">
                  <Hand className="size-4" />{nudged ? 'Toque enviado hoy' : `Dar un toque a ${partner?.display_name ?? 'tu pareja'}`}
                </button>
              )}
            </CoupleScene>
          </>
        )}

        <VisitCountdown />
        <PauseBanners />
        <JointInvites />

        {toApprove.length > 0 && (
          <Card onClick={() => nav('/propuestas')} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-blush text-ember dark:bg-noche-700"><Vote className="size-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">{toApprove.length === 1 ? 'Un cambio espera tu respuesta' : `${toApprove.length} cambios esperan tu respuesta`}</p><p className="muted truncate text-[13px]">{toApprove[0].title}</p></div>
            <ChevronRight className="size-5 text-fuego-800/40" />
          </Card>
        )}

        {draft && (
          <Card onClick={() => nav('/gym', { state: { resume: true } })} className="flex items-center gap-3 ring-2 ring-ember/40" data-testid="resume-workout">
            <span className="flex size-10 items-center justify-center rounded-full bg-ember text-white animate-pulse"><Dumbbell className="size-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">Entrenamiento a medio hacer</p><p className="muted truncate text-[13px]">{draft.title} · {draftDoneSets(draft)} {draftDoneSets(draft) === 1 ? "serie" : "series"} · toca para continuar</p></div>
            <ChevronRight className="size-5 text-fuego-800/40" />
          </Card>
        )}

        <SectionTitle>Registrar</SectionTitle>
        <div className="grid grid-cols-4 gap-2" data-tour="quick">
          {[
            { k: 'workout', label: 'Entreno', icon: Dumbbell, onClick: () => setSheet('workout') },
            { k: 'water', label: 'Agua', icon: Droplets, onClick: () => setSheet('water') },
            { k: 'activity', label: 'Actividad', icon: Activity, onClick: () => setSheet('activity') },
            { k: 'cant', label: 'No puedo', icon: Moon, onClick: () => setDayOpts(true) },
          ].map(a => (
            <button key={a.k} onClick={a.onClick} className="card flex flex-col items-center gap-2 px-1 py-3.5 text-[12px] font-medium transition active:scale-95">
              <a.icon className="size-[22px]" strokeWidth={1.7} />
              {a.label}
            </button>
          ))}
        </div>

        {todayPlans.length > 0 && (
          <Card onClick={() => nav('/calendario')} className="flex items-center gap-3 py-3" data-testid="today-plans">
            <span className="text-[22px]">📝</span>
            <p className="min-w-0 flex-1 text-[13.5px]"><b>Plan de hoy:</b> {todayPlans.map(p => `${p.user_id === uid ? 'tú' : partner?.display_name}: ${p.title}`).join(' · ')}</p>
            <ChevronRight className="size-5 text-fuego-800/40" />
          </Card>
        )}

        <CheckInCard />

        <WeighInCard />

        <GoalsHome />

        <WeeklySummary />

        <SectionTitle action={<Link to="/estadisticas" className="text-[13px] font-medium text-ember">Estadísticas</Link>}>Tu día</SectionTitle>
        <Card className="divide-y divide-black/[.05] p-0 dark:divide-white/[.06]" data-tour="day">
          {[
            { icon: Droplets, tint: 'text-sky-500', label: 'Agua', value: `${fmtLiters(water)} / ${fmtLiters(goal)}`, v: water, max: goal, to: '/habitos/agua', quick: { label: '+ Vaso', onClick: () => addWater.mutate({ ml: 250, label: 'Vaso' }) } },
            { icon: Activity, tint: 'text-ember', label: 'Actividad', value: `${mine?.details.activity_minutes ?? 0} / ${profile?.activity_goal_min ?? 30} min`, v: mine?.details.activity_minutes ?? 0, max: profile?.activity_goal_min || 30, to: '/habitos/actividad', quick: { label: '+ Registrar', onClick: () => setSheet('activity') } },
            { icon: Apple, tint: 'text-lime-600', label: 'Comida', value: `${nutri.protein}/${nutri.goal} g proteína · ${nutri.produce}/${PRODUCE_GOAL} 🥦`, v: Math.min(1, nutri.protein / Math.max(1, nutri.goal)) + Math.min(1, nutri.produce / PRODUCE_GOAL), max: 2, to: '', quick: { label: '+ Sumar', onClick: () => setFood(true) } },
            { icon: CircleCheckBig, tint: 'text-emerald-500', label: 'Hábitos', value: dailyHabits.length ? `${habitsDone} / ${dailyHabits.length}` : 'Sin hábitos', v: habitsDone, max: dailyHabits.length || 1, to: '/habitos' },
            { icon: Dumbbell, tint: 'text-ink dark:text-white', label: 'Entrenos esta semana', value: `${week.data?.workouts ?? 0} / ${profile?.weekly_workouts_goal ?? 4}`, v: week.data?.workouts ?? 0, max: profile?.weekly_workouts_goal || 4, to: '/gym/historial' },
          ].map(r => (
            <div key={r.label} className="flex w-full items-center gap-3 px-4 py-3.5">
              <button type="button" onClick={() => (r.to ? nav(r.to) : setFood(true))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <r.icon className={cx('size-5 shrink-0', r.tint)} strokeWidth={1.8} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="text-[15px] font-medium">{r.label}</span><span className="tabular muted text-[13px]">{r.value}</span></div>
                  <ProgressBar className="mt-2" value={r.v} max={r.max} />
                </div>
              </button>
              {'quick' in r && r.quick && <button type="button" onClick={r.quick.onClick} className="shrink-0 rounded-full bg-fuego-100 px-3 py-2 text-[12.5px] font-bold text-fuego-700 transition active:scale-90 dark:bg-noche-700 dark:text-fuego-100">{r.quick.label}</button>}
            </div>
          ))}
          {dailyHabits.length > 0 && (
            <div className="px-4 py-3.5">
              <p className="muted mb-2 text-[12.5px] font-semibold">Hábitos de hoy · toca para marcar</p>
              <div className="flex flex-wrap gap-1.5">
                {dailyHabits.map(h => {
                  const on = !!week.data?.logs.some(l => l.habit_id === h.id)
                  return (
                    <button key={h.id} type="button" onClick={() => toggleHabit.mutate({ id: h.id, on })} aria-pressed={on}
                      className={cx('flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-90', on ? 'bg-emerald-500 text-white shadow-sm' : 'bg-fuego-100 text-fuego-800 dark:bg-noche-700 dark:text-white/80')}>
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : <span>{h.emoji ?? '•'}</span>}{h.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        <p className="px-6 pb-2 pt-6 text-center text-[13px] italic leading-relaxed text-fuego-800/60 dark:text-white/40">“{quote}”</p>
      </div>

      <LevelUpWatcher />
      <QuickWorkoutSheet open={sheet === 'workout'} onClose={() => setSheet(null)} />
      <WaterSheet open={sheet === 'water'} onClose={() => setSheet(null)} />
      <ActivitySheet open={sheet === 'activity'} onClose={() => setSheet(null)} />
      <DayOptionsSheet open={dayOpts} onClose={() => setDayOpts(false)} />
      <NutritionSheet open={food} onClose={() => setFood(false)} />
    </div>
  )
}
