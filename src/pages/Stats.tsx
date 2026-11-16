import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Dumbbell, Droplets, Activity, Footprints, ListChecks, Flame as FlameIcon, Trophy } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useStreak, useToday } from '../lib/queries'
import { addDays, endOfMonth, fmtLiters, fmtNum, fmtShort, startOfMonth, startOfWeek } from '../lib/dates'
import { Card, Loading, Segmented } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import type { Goal } from '../lib/types'

type Range = 'dia' | 'semana' | 'mes'
interface Row { user_id: string; workouts: number; workout_minutes: number; activity_minutes: number; steps: number; water_ml: number; habit_checks: number; completed_days: number; rest_days: number }
interface Series { user_id: string; day: string; workouts: number; activity_minutes: number; steps: number; water_ml: number; habit_checks: number }

export default function Stats() {
  const nav = useNavigate()
  const { uid, partner, couple } = useAuth()
  const today = useToday()
  const streak = useStreak().data
  const [range, setRange] = useState<Range>('semana')
  const [from, to] = useMemo(() => {
    if (!today) return [null, null]
    if (range === 'dia') return [today, today]
    if (range === 'semana') { const s = startOfWeek(today); return [s, addDays(s, 6)] }
    return [startOfMonth(today), endOfMonth(today)]
  }, [today, range])
  const stats = useQuery({ queryKey: ['stats', from, to], enabled: !!from, queryFn: () => must(supabase.rpc('couple_stats', { p_from: from, p_to: to })) as Promise<Row[]> })
  const series = useQuery({ queryKey: ['stats', 'series', from, to], enabled: !!from && range !== 'dia', queryFn: () => must(supabase.rpc('daily_series', { p_from: from, p_to: to })) as Promise<Series[]> })
  const goalsDone = useQuery({ queryKey: ['goals', 'done'], queryFn: () => must(supabase.from('goals').select('id,status').eq('status', 'completed')) as Promise<Goal[]> }).data?.length ?? 0
  const me = stats.data?.find(r => r.user_id === uid)
  const pa = stats.data?.find(r => r.user_id !== uid)
  const chart = useMemo(() => {
    const days = [...new Set((series.data ?? []).map(s => s.day))]
    return days.map(d => {
      const a = series.data!.find(s => s.day === d && s.user_id === uid)
      const b = series.data!.find(s => s.day === d && s.user_id !== uid)
      return { day: fmtShort(d), Tú: a?.activity_minutes ?? 0, [partner?.display_name ?? 'Pareja']: b?.activity_minutes ?? 0, aguaTú: (a?.water_ml ?? 0) / 1000, [`agua${partner?.display_name ?? 'Pareja'}`]: (b?.water_ml ?? 0) / 1000 }
    })
  }, [series.data, uid, partner])
  const pName = partner?.display_name ?? 'Pareja'

  const metrics: { icon: typeof Dumbbell; label: string; val: (r?: Row) => string; num: (r?: Row) => number }[] = [
    { icon: Dumbbell, label: 'Entrenamientos', val: r => String(r?.workouts ?? 0), num: r => r?.workouts ?? 0 },
    { icon: Activity, label: 'Min. de actividad', val: r => fmtNum((r?.activity_minutes ?? 0) + (r?.workout_minutes ?? 0)), num: r => (r?.activity_minutes ?? 0) + (r?.workout_minutes ?? 0) },
    { icon: Footprints, label: 'Pasos', val: r => fmtNum(r?.steps ?? 0), num: r => r?.steps ?? 0 },
    { icon: Droplets, label: 'Agua', val: r => fmtLiters(r?.water_ml ?? 0), num: r => r?.water_ml ?? 0 },
    { icon: ListChecks, label: 'Hábitos', val: r => String(r?.habit_checks ?? 0), num: r => r?.habit_checks ?? 0 },
    { icon: FlameIcon, label: 'Días cumplidos', val: r => String(r?.completed_days ?? 0), num: r => r?.completed_days ?? 0 },
  ]

  return (
    <div>
      <PageHeader title="Estadísticas" subtitle={from && to ? (from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`) : ''}
        back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>} />
      <div className="space-y-3 px-4 pb-6">
        <Segmented value={range} onChange={setRange} options={[{ value: 'dia', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} />
        {couple && (
          <div className="grid grid-cols-3 gap-2">
            <Card className="text-center"><p className="text-3xl font-black text-fuego-600">{streak?.current_count ?? 0}</p><p className="muted text-xs">racha actual</p></Card>
            <Card className="text-center"><p className="text-3xl font-black text-fuego-600">{streak?.best_count ?? 0}</p><p className="muted text-xs">récord</p></Card>
            <Card className="text-center"><p className="text-3xl font-black text-fuego-600">{goalsDone}</p><p className="muted text-xs">metas cumplidas</p></Card>
          </div>
        )}
        {stats.isLoading ? <Loading /> : (
          <Card>
            <div className="mb-2 grid grid-cols-[1fr_80px_80px] text-xs font-bold"><span /><span className="text-center">Tú</span>{partner && <span className="text-center">{pName}</span>}</div>
            {metrics.map(m => {
              const a = m.num(me), b = m.num(pa)
              return (
                <div key={m.label} className="grid grid-cols-[1fr_80px_80px] items-center border-t border-fuego-100 py-2.5 dark:border-noche-700">
                  <span className="flex items-center gap-2 text-sm"><m.icon className="size-4 text-fuego-500" />{m.label}</span>
                  <span className="text-center font-bold">{m.val(me)}</span>
                  {partner && <span className="text-center font-bold">{m.val(pa)}</span>}
                  {partner && (a + b) > 0 && <div className="col-span-3 mt-1 flex h-2 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700"><div className="bg-fuego-500" style={{ width: `${(a / (a + b)) * 100}%` }} /><div className="bg-rosa-400" style={{ width: `${(b / (a + b)) * 100}%` }} /></div>}
                </div>
              )
            })}
            {partner && me && pa && (
              <p className="mt-3 rounded-xl bg-fuego-50 p-3 text-center text-sm font-semibold dark:bg-noche-900">
                <Trophy className="mr-1 inline size-4 text-amber-500" />
                Juntos: {me.workouts + pa.workouts} entrenamientos, {fmtLiters(me.water_ml + pa.water_ml)} de agua y {fmtNum(me.steps + pa.steps)} pasos. ¡Equipazo! 🔥
              </p>
            )}
          </Card>
        )}
        {range !== 'dia' && chart.length > 0 && (
          <>
            <Card>
              <p className="mb-2 font-bold">Minutos de actividad por día</p>
              <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -24, right: 4 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={range === 'mes' ? 4 : 0} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Tú" fill="#ef233c" radius={[4, 4, 0, 0]} />
                  {partner && <Bar dataKey={pName} fill="#ff4d8d" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer></div>
            </Card>
            <Card>
              <p className="mb-2 font-bold">Agua por día (L)</p>
              <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -24, right: 4 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={range === 'mes' ? 4 : 0} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
                  <Bar dataKey="aguaTú" name="Tú" fill="#ef233c" radius={[4, 4, 0, 0]} />
                  {partner && <Bar dataKey={`agua${pName}`} name={pName} fill="#ff4d8d" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer></div>
            </Card>
          </>
        )}
        <p className="muted text-center text-xs">Cada uno a su ritmo: lo importante es sumar juntos. 💞 Tu pareja solo ve estos totales, nunca tus registros detallados.</p>
      </div>
    </div>
  )
}
