import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Dumbbell, Droplets, Activity, Moon, HeartHandshake, ChevronRight, Vote, ListChecks, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { supabase, must } from '../lib/supabase'
import { LOG_KEYS, rulesFor, useAction, useMemberDays, useNotifications, useProposals, useRules, useStreak, useToday, useTodayWindow } from '../lib/queries'
import { addDays, fmtLiters, fmtLongDay, startOfWeek } from '../lib/dates'
import { Card, ProgressBar, Ring, SectionTitle, cx, useUi } from '../components/ui'
import { Flame } from '../components/Flame'
import { Avatar } from '../components/Avatar'
import { ActivitySheet, MemberToday, QuickWorkoutSheet, WaterSheet, conditionText, useWaterToday } from '../components/Today'
import type { Habit, HabitLog, MemberDay } from '../lib/types'

const QUOTES = [
  'La constancia les gana a las ganas. ¡Hoy suman los dos! 🔥',
  'Lejos en kilómetros, juntos en cada repetición. 💪',
  'Un día a la vez, una llama para dos. ❤️',
  'No tiene que ser perfecto, tiene que ser hoy.',
  'Tu pareja cuenta contigo. ¡Tú cuentas con tu pareja!',
  'Pequeños pasos, gran equipo. ✨',
  'La distancia no apaga lo que alimentan todos los días.',
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

export default function Home() {
  const { profile, couple, partner, uid } = useAuth()
  const nav = useNavigate()
  const { toast, confirm } = useUi()
  const today = useToday()
  const streak = useStreak().data
  const rulesAll = useRules().data
  const rules = rulesFor(rulesAll, today)?.rules
  const { mine, theirs } = useMyAndPartnerToday()
  const water = useWaterToday().data ?? 0
  const unread = (useNotifications().data ?? []).filter(n => !n.read_at).length
  const pending = (useProposals().data ?? []).filter(p => p.status === 'pending')
  const toApprove = pending.filter(p => p.proposed_by !== uid)
  const [sheet, setSheet] = useState<null | 'workout' | 'water' | 'activity'>(null)
  const quote = useMemo(() => QUOTES[new Date().getDate() % QUOTES.length], [])

  const week = useQuery({
    queryKey: ['week_summary', uid, today],
    enabled: !!today,
    queryFn: async () => {
      const ws = startOfWeek(today!)
      const [w, habits, logs] = await Promise.all([
        must(supabase.from('workouts').select('local_day').gte('local_day', ws).lte('local_day', addDays(ws, 6))),
        must(supabase.from('habits').select('*').eq('archived', false)),
        must(supabase.from('habit_logs').select('habit_id, local_day').eq('local_day', today!)),
      ])
      return { workouts: (w as { local_day: string }[]).length, habits: habits as Habit[], logs: logs as HabitLog[], daysLeft: 6 - Math.round((new Date(today!).getTime() - new Date(ws).getTime()) / 86400000) }
    },
  })
  const dailyHabits = (week.data?.habits ?? []).filter(h => h.frequency === 'daily' && h.start_date <= (today ?? '') && (!h.end_date || h.end_date >= (today ?? '')))
  const habitsPending = dailyHabits.filter(h => !week.data?.logs.some(l => l.habit_id === h.id))

  const rest = useAction(async () => {
    await must(supabase.from('rest_days').insert({ user_id: uid, day: today }))
  }, { invalidate: LOG_KEYS, success: 'Día de descanso marcado 😴' })

  const goal = profile?.water_goal_ml ?? 2500
  const bothDone = mine?.status && ['completed', 'rest'].includes(mine.status) && theirs?.status && ['completed', 'rest'].includes(theirs.status)
  const lit = !!bothDone || (streak?.current_count ?? 0) > 0
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      <header className="safe-top flex items-center gap-3 px-4 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <p className="muted text-sm capitalize">{today ? fmtLongDay(today) : ''}</p>
          <h1 className="truncate text-2xl font-extrabold">{greet}, {profile?.display_name?.split(' ')[0] ?? ''} 👋</h1>
        </div>
        <Link to="/notificaciones" className="relative flex size-11 items-center justify-center rounded-full bg-white shadow-sm dark:bg-noche-800" aria-label="Notificaciones">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-fuego-500 px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
        </Link>
        <Link to="/perfil" aria-label="Perfil"><Avatar path={profile?.avatar_path} name={profile?.display_name} size={44} /></Link>
      </header>

      <div className="space-y-4 px-4">
        {!couple && (
          <Card onClick={() => nav('/vincular')} className="flex items-center gap-4 bg-gradient-to-r from-fuego-500 to-rosa-400 text-white ring-0">
            <HeartHandshake className="size-10 shrink-0" />
            <div className="flex-1">
              <p className="text-lg font-bold">Vincula a tu pareja</p>
              <p className="text-sm opacity-90">La racha compartida empieza cuando estén los dos.</p>
            </div>
            <ChevronRight />
          </Card>
        )}

        {couple && (
          <Card onClick={() => nav('/racha')} className="overflow-hidden">
            <div className="flex items-center gap-4">
              <Flame size={96} lit={lit} intensity={Math.min(1, (streak?.current_count ?? 0) / 30)} />
              <div className="flex-1">
                <p className="muted text-sm font-semibold">Racha compartida</p>
                <p className="text-5xl font-black leading-none tracking-tight text-fuego-600 dark:text-fuego-300">{streak?.current_count ?? 0}</p>
                <p className="text-sm font-semibold">{(streak?.current_count ?? 0) === 1 ? 'día' : 'días'} juntos 🔥 · récord {streak?.best_count ?? 0}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <MemberToday row={mine} name={profile?.display_name ?? 'Tú'} avatar={profile?.avatar_path} me />
              <MemberToday row={theirs} name={partner?.display_name ?? 'Pareja'} avatar={partner?.avatar_path} />
            </div>
            <p className={cx('mt-3 rounded-xl px-3 py-2 text-center text-sm font-semibold',
              bothDone ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100')}>
              {bothDone ? '¡Hoy los dos cumplieron! La llama sigue viva 🔥'
                : mine?.status === 'completed' || mine?.status === 'rest' ? `Falta ${partner?.display_name ?? 'tu pareja'} para sumar hoy. ¡Mándale ánimo!`
                : theirs?.status === 'completed' || theirs?.status === 'rest' ? `${partner?.display_name ?? 'Tu pareja'} ya cumplió. ¡Te toca!`
                : rules ? `Para sumar: ${conditionText(rules)}` : 'Registren su actividad de hoy'}
            </p>
          </Card>
        )}

        {toApprove.length > 0 && (
          <Card onClick={() => nav('/propuestas')} className="flex items-center gap-3 ring-2 ring-rosa-400">
            <Vote className="size-7 text-rosa-500" />
            <div className="flex-1"><p className="font-bold">{toApprove.length} cambio(s) esperan tu aprobación</p><p className="muted text-sm">{toApprove[0].title}</p></div>
            <ChevronRight />
          </Card>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[
            { k: 'workout', label: 'Entrené', icon: Dumbbell, onClick: () => setSheet('workout') },
            { k: 'water', label: 'Agua', icon: Droplets, onClick: () => setSheet('water') },
            { k: 'activity', label: 'Actividad', icon: Activity, onClick: () => setSheet('activity') },
            { k: 'rest', label: 'Descanso', icon: Moon, onClick: async () => {
              if (!couple) return toast('El descanso se usa en la racha compartida: vincula a tu pareja primero.', 'error')
              if (await confirm({ title: '¿Usar día de descanso hoy?', text: `Las reglas permiten ${rulesFor(rulesAll, today)?.rules.rest_days_per_week ?? 1} por semana. Si igual entrenas, cuenta como completado.`, confirm: 'Sí, descansar' })) rest.mutate()
            } },
          ].map(a => (
            <button key={a.k} onClick={a.onClick} className="card flex min-h-20 flex-col items-center justify-center gap-1 p-2 text-xs font-bold active:scale-95">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuego-500 to-rosa-400 text-white"><a.icon className="size-5" /></span>
              {a.label}
            </button>
          ))}
        </div>

        <SectionTitle action={<Link to="/estadisticas" className="flex items-center gap-1 text-sm font-semibold text-fuego-600"><BarChart3 className="size-4" />Estadísticas</Link>}>Hoy</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Card onClick={() => setSheet('water')} className="flex flex-col items-center">
            <Ring value={water} max={goal} size={104} color="#ff4d8d">
              <Droplets className="size-5 text-rosa-400" />
              <span className="text-lg font-black">{fmtLiters(water)}</span>
              <span className="muted text-[11px]">de {fmtLiters(goal)}</span>
            </Ring>
          </Card>
          <Card onClick={() => nav('/gym')} className="flex flex-col justify-between">
            <div className="flex items-center gap-2"><Dumbbell className="size-5 text-fuego-500" /><span className="font-bold">Gimnasio</span></div>
            <p className="text-3xl font-black">{mine?.details.workouts ?? 0}</p>
            <p className="muted text-xs">entrenamiento(s) hoy · {mine?.details.activity_minutes ?? 0} min de actividad</p>
          </Card>
        </div>

        <Card onClick={() => nav('/habitos')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><ListChecks className="size-5 text-fuego-500" /><span className="font-bold">Hábitos de hoy</span></div>
            <span className="text-sm font-bold text-fuego-600">{dailyHabits.length - habitsPending.length}/{dailyHabits.length}</span>
          </div>
          {dailyHabits.length === 0 ? <p className="muted mt-2 text-sm">Aún no tienes hábitos. Toca para crear el primero.</p> : (
            <>
              <ProgressBar className="mt-3" value={dailyHabits.length - habitsPending.length} max={dailyHabits.length} />
              {habitsPending.length > 0 && <p className="muted mt-2 text-sm">Pendientes: {habitsPending.slice(0, 3).map(h => `${h.emoji ?? ''} ${h.name}`).join(', ')}{habitsPending.length > 3 ? '…' : ''}</p>}
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="font-bold">Progreso semanal</span>
            <span className="muted text-sm">{week.data ? `quedan ${week.data.daysLeft} día(s)` : ''}</span>
          </div>
          <div className="mt-3 flex items-end justify-between text-sm">
            <span>Entrenamientos</span>
            <span className="font-bold">{week.data?.workouts ?? 0} / {profile?.weekly_workouts_goal ?? 4}</span>
          </div>
          <ProgressBar className="mt-1" value={week.data?.workouts ?? 0} max={profile?.weekly_workouts_goal ?? 4} />
          {rules && rules.weekly_workouts_target > 0 && (
            <p className="muted mt-2 text-xs">Meta semanal de la pareja: {rules.weekly_workouts_target} entrenamientos cada uno.</p>
          )}
        </Card>

        <div className="rounded-3xl bg-gradient-to-br from-fuego-500 via-fuego-400 to-rosa-400 p-5 text-white shadow-lg shadow-fuego-500/25">
          <p className="text-sm font-semibold opacity-80">Motivación del día</p>
          <p className="mt-1 text-lg font-bold leading-snug">{quote}</p>
        </div>
      </div>

      <QuickWorkoutSheet open={sheet === 'workout'} onClose={() => setSheet(null)} />
      <WaterSheet open={sheet === 'water'} onClose={() => setSheet(null)} />
      <ActivitySheet open={sheet === 'activity'} onClose={() => setSheet(null)} />
    </div>
  )
}
