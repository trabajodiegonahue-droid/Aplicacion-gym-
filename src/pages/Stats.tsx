import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Moon, Check, Snowflake } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useStreak, useStreakDays, useToday } from '../lib/queries'
import { addDays, endOfMonth, fmtLiters, fmtNum, fmtShort, parseISODate, startOfMonth, startOfWeek, WEEKDAYS_MON } from '../lib/dates'
import { Card, Loading, ProgressBar, Segmented, cx } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import type { Goal } from '../lib/types'
import { colorFor, levelFromXp, stageForLevel, useLevels } from '../lib/levels'
import { Character } from '../components/Character'
import { CountUp } from '../components/Motion'
import { ENERGY, MOOD, type Checkin } from '../lib/life'

type Range = 'dia' | 'semana' | 'mes'
interface Row { user_id: string; workouts: number; workout_minutes: number; activity_minutes: number; steps: number; water_ml: number; habit_checks: number; completed_days: number; rest_days: number }
interface Series { user_id: string; day: string; workouts: number; activity_minutes: number; steps: number; water_ml: number; habit_checks: number }

const COLORS = { rojo: '#f43f5e', naranja: '#fb923c' }

function rangeFor(today: string, r: Range, back = 0): [string, string] {
  if (r === 'dia') { const d = addDays(today, -back); return [d, d] }
  if (r === 'semana') { const s = addDays(startOfWeek(today), -7 * back); return [s, addDays(s, 6)] }
  const base = parseISODate(startOfMonth(today)); base.setMonth(base.getMonth() - back)
  const s = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`
  return [s, endOfMonth(s)]
}

export default function Stats() {
  const nav = useNavigate()
  const { uid, partner, couple, profile } = useAuth()
  const today = useToday()
  const streak = useStreak().data
  const [range, setRange] = useState<Range>('semana')
  const [from, to] = today ? rangeFor(today, range) : [null, null]
  const [pFrom] = today ? rangeFor(today, range, 1) : [null]
  // En el período actual solo cuentan los días ya vividos (para comparar justo con el anterior)
  const elapsed = from && today ? Math.min(Math.round((parseISODate(today).getTime() - parseISODate(from).getTime()) / 86400000), Math.round((parseISODate(to!).getTime() - parseISODate(from).getTime()) / 86400000)) : 0
  const pToFair = pFrom ? addDays(pFrom, elapsed) : null

  const stats = useQuery({ queryKey: ['stats', from, to], enabled: !!from, queryFn: () => must(supabase.rpc('couple_stats', { p_from: from, p_to: to })) as Promise<Row[]> })
  const prev = useQuery({ queryKey: ['stats', 'prev', pFrom, pToFair], enabled: !!pFrom, queryFn: () => must(supabase.rpc('couple_stats', { p_from: pFrom, p_to: pToFair })) as Promise<Row[]> })
  const series = useQuery({ queryKey: ['stats', 'series', from, to], enabled: !!from && range !== 'dia', queryFn: () => must(supabase.rpc('daily_series', { p_from: from, p_to: to })) as Promise<Series[]> })
  const sdays = useStreakDays(from, to).data ?? []
  const checkins = useQuery({ queryKey: ['life', 'checkins-range', from, to], enabled: !!from, queryFn: () => must(supabase.from('checkins').select('*').gte('day', from!).lte('day', to!)) as Promise<Checkin[]> }).data ?? []
  const goalsDone = useQuery({ queryKey: ['goals', 'done'], queryFn: () => must(supabase.from('goals').select('id,status').eq('status', 'completed')) as Promise<Goal[]> }).data?.length ?? 0
  const levels = useLevels().data ?? []
  const myColor = colorFor(uid, partner?.id)
  const theirColor = colorFor(partner?.id, uid)
  const pName = partner?.display_name ?? 'Pareja'
  const myName = profile?.display_name ?? 'Tú'

  const team = (rows: Row[] | undefined, f: (r: Row) => number) => (rows ?? []).reduce((a, r) => a + f(r), 0)
  const metrics: { icon: string; label: string; f: (r: Row) => number; fmt: (n: number) => string }[] = [
    { icon: '🏋️', label: 'Entrenamientos', f: r => r.workouts, fmt: n => String(n) },
    { icon: '⏱️', label: 'Minutos en movimiento', f: r => r.activity_minutes + r.workout_minutes, fmt: n => fmtNum(n) },
    { icon: '👣', label: 'Pasos', f: r => r.steps, fmt: n => fmtNum(n) },
    { icon: '💧', label: 'Agua', f: r => r.water_ml, fmt: n => fmtLiters(n) },
    { icon: '✅', label: 'Hábitos', f: r => r.habit_checks, fmt: n => String(n) },
    { icon: '🌙', label: 'Días de descanso', f: r => r.rest_days, fmt: n => String(n) },
  ]

  const chart = useMemo(() => {
    const days = [...new Set((series.data ?? []).map(s => s.day))].sort()
    return days.map(d => {
      const a = series.data!.find(s => s.day === d && s.user_id === uid)
      const b = series.data!.find(s => s.day === d && s.user_id !== uid)
      return {
        day: range === 'semana' ? WEEKDAYS_MON[(parseISODate(d).getDay() + 6) % 7] : String(Number(d.slice(8))), full: fmtShort(d), future: today ? d > today : false,
        mov_me: a?.activity_minutes ?? 0, mov_them: b?.activity_minutes ?? 0,
        w_me: (a?.water_ml ?? 0) / 1000, w_them: (b?.water_ml ?? 0) / 1000,
      }
    })
  }, [series.data, uid, range, today])
  const lived = chart.filter(c => !c.future)
  const avgMov = lived.length ? Math.round(lived.reduce((a, c) => a + c.mov_me + c.mov_them, 0) / lived.length) : 0
  const best = lived.reduce<(typeof lived)[number] | null>((m, c) => (!m || c.mov_me + c.mov_them > m.mov_me + m.mov_them ? c : m), null)

  const totalMinutes = team(stats.data, r => r.activity_minutes + r.workout_minutes)
  const prevMinutes = team(prev.data, r => r.activity_minutes + r.workout_minutes)
  const trend = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : null
  const coupleDone = sdays.filter(d => d.status === 'completed' || d.status === 'recovered').length
  const daysInRange = from && to ? Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86400000) + 1 : 1
  const livedDays = Math.min(daysInRange, elapsed + 1)

  const tooltip = { contentStyle: { borderRadius: 14, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.25)', fontSize: 12 }, cursor: { fill: 'rgba(244,63,94,.06)', radius: 8 } as object }

  return (
    <div>
      <PageHeader title="Estadísticas" subtitle={from && to ? (from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`) : ''}
        back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>} />
      <div className="stagger space-y-3 px-4 pb-6">
        <Segmented value={range} onChange={setRange} options={[{ value: 'dia', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} />

        {/* Héroe: el equipo */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-orange-400 via-rose-500 to-fuego-600 p-5 text-white shadow-[0_20px_40px_-18px_rgba(225,29,72,.55)]">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -left-8 size-36 rounded-full bg-white/10" />
          <p className="relative text-[12px] font-semibold uppercase tracking-[.1em] text-white/80">{couple ? 'Juntos en movimiento' : 'En movimiento'}</p>
          <div className="relative mt-1 flex items-end gap-2">
            <CountUp value={totalMinutes} className="tabular font-display text-[52px] font-bold leading-none" />
            <span className="pb-1.5 text-[15px] font-medium text-white/85">minutos</span>
          </div>
          <p className="relative mt-1 text-[13.5px] text-white/90">
            {trend === null ? 'Sigan sumando: este es su punto de partida ✨' : trend > 0 ? `▲ ${trend}% más que el período anterior. ¡Vamos equipo! 🔥` : trend === 0 ? 'Igual que el período anterior: constancia pura 💪' : 'Un período más tranquilo. Descansar también es parte 🌙'}
          </p>
          {couple && (
            <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
              {[{ v: streak?.current_count ?? 0, l: 'racha actual' }, { v: `${coupleDone}/${livedDays}`, l: livedDays === 1 ? 'día juntos' : 'días juntos' }, { v: goalsDone, l: 'metas logradas' }].map(x => (
                <div key={x.l} className="rounded-2xl bg-white/15 px-1 py-2">
                  <p className="tabular font-display text-[24px] font-bold leading-none">{x.v}</p>
                  <p className="mt-1 text-[11px] text-white/85">{x.l}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totales del equipo */}
        {stats.isLoading ? <Loading /> : (
          <div className="grid grid-cols-2 gap-2">
            {metrics.map(m => {
              const now = team(stats.data, m.f), before = team(prev.data, m.f)
              const me = stats.data?.find(r => r.user_id === uid), pa = stats.data?.find(r => r.user_id !== uid)
              const a = me ? m.f(me) : 0, b = pa ? m.f(pa) : 0
              return (
                <Card key={m.label} className="p-3.5">
                  <p className="text-[12px] font-medium text-fuego-800/80 dark:text-white/60">{m.icon} {m.label}</p>
                  <p className="tabular font-display mt-1 text-[24px] font-bold leading-none">{m.fmt(now)}</p>
                  {partner && now > 0 && (
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700" title="Aportes de cada uno al total del equipo">
                      <div className="bar-grow h-full" style={{ width: `${(a / now) * 100}%`, background: COLORS[myColor] }} />
                      <div className="bar-grow h-full" style={{ width: `${(b / now) * 100}%`, background: COLORS[theirColor] }} />
                    </div>
                  )}
                  {prev.data && (before > 0 || now > 0) && (
                    <p className={cx('mt-1.5 text-[11px] font-semibold', now > before ? 'text-emerald-600 dark:text-emerald-400' : 'muted')}>
                      {now > before ? `▲ +${m.fmt(now - before)} vs. anterior` : now === before ? '= que el anterior' : 'Más tranquilo que el anterior'}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
        {partner && <p className="muted -mt-1 flex items-center justify-center gap-3 text-[11.5px]"><span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: COLORS[myColor] }} />{myName}</span><span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: COLORS[theirColor] }} />{pName}</span><span>· la barra es lo que suman juntos</span></p>}

        {/* Cómo se sintieron */}
        {checkins.length > 0 && (
          <Card>
            <p className="font-bold">💭 Cómo se sintieron</p>
            <p className="muted mb-2 text-[12.5px]">Promedios del período (de lo que contaron en "¿Cómo te sientes hoy?").</p>
            <div className="space-y-2">
              {[{ id: uid, name: myName }, ...(partner ? [{ id: partner.id, name: pName }] : [])].map(p => {
                const c = checkins.filter(x => x.user_id === p.id)
                if (!c.length) return <p key={p.id} className="muted text-[13px]">{p.name}: sin registros.</p>
                const avg = (f: (x: Checkin) => number | null) => { const v = c.map(f).filter((n): n is number => n != null); return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null }
                const e = avg(x => x.energy), m = avg(x => x.mood), sl = avg(x => (x.sleep_hours == null ? null : Number(x.sleep_hours)))
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="w-16 shrink-0 font-semibold">{p.name}</span>
                    {e != null && <span className="chip">{ENERGY[Math.round(e)]} energía {e.toFixed(1)}</span>}
                    {m != null && <span className="chip">{MOOD[Math.round(m)]} ánimo {m.toFixed(1)}</span>}
                    {sl != null && <span className="chip">😴 {sl.toFixed(1)} h</span>}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Calendario de la racha */}
        {couple && range !== 'dia' && from && to && (
          <Card>
            <p className="font-bold">🔥 Calendario de la racha</p>
            <p className="muted text-[12.5px]">Cada día que cumplieron los dos se enciende.</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {WEEKDAYS_MON.map(w => <span key={w} className="muted text-center text-[10.5px] font-semibold">{w}</span>)}
              {Array.from({ length: (parseISODate(from).getDay() + 6) % 7 }, (_, i) => <span key={'e' + i} />)}
              {Array.from({ length: daysInRange }, (_, i) => {
                const d = addDays(from, i)
                const st = sdays.find(x => x.day === d)?.status
                const fut = today ? d > today : false
                return (
                  <span key={d} style={{ animationDelay: `${i * 18}ms` }} className={cx('stagger-dot flex aspect-square items-center justify-center rounded-xl text-[11px] font-semibold',
                    st === 'completed' || st === 'recovered' ? 'bg-ember text-white shadow-sm' : st === 'rest' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200' : st === 'paused' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : fut ? 'text-fuego-800/30 dark:text-white/25' : 'bg-fuego-100 text-fuego-800/60 dark:bg-noche-700 dark:text-white/50',
                    d === today && 'ring-2 ring-fuego-400 ring-offset-1 ring-offset-white dark:ring-offset-noche-800')}>
                    {st === 'completed' || st === 'recovered' ? <Check className="size-3.5" strokeWidth={3} /> : st === 'rest' ? <Moon className="size-3" /> : st === 'paused' ? <Snowflake className="size-3" /> : Number(d.slice(8))}
                  </span>
                )
              })}
            </div>
          </Card>
        )}

        {/* Gráficos en equipo (barras apiladas = lo que suman juntos) */}
        {range !== 'dia' && chart.length > 0 && (
          <>
            <Card>
              <div className="flex items-baseline justify-between"><p className="font-bold">Actividad juntos (min)</p>{avgMov > 0 && <span className="muted text-[12px]">promedio {avgMov}/día</span>}</div>
              {best && best.mov_me + best.mov_them > 0 && <p className="muted mb-2 text-[12.5px]">⭐ Su mejor día: {best.full} con {best.mov_me + best.mov_them} min</p>}
              <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -26, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgba(120,80,60,.15)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={range === 'mes' ? 3 : 0} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltip} labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''} />
                  {avgMov > 0 && <ReferenceLine y={avgMov} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={.6} />}
                  <Bar dataKey="mov_me" name={myName} stackId="a" fill={COLORS[myColor]} minPointSize={2} animationDuration={900} />
                  {partner && <Bar dataKey="mov_them" name={pName} stackId="a" fill={COLORS[theirColor]} radius={[8, 8, 0, 0]} animationDuration={900} />}
                </BarChart>
              </ResponsiveContainer></div>
            </Card>
            <Card>
              <p className="mb-2 font-bold">Agua juntos (L)</p>
              <div className="h-48"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -26, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgba(60,120,160,.15)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={range === 'mes' ? 3 : 0} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltip} labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''} />
                  <Bar dataKey="w_me" name={myName} stackId="w" fill="#0ea5e9" minPointSize={2} animationDuration={900} />
                  {partner && <Bar dataKey="w_them" name={pName} stackId="w" fill="#7dd3fc" radius={[8, 8, 0, 0]} animationDuration={900} />}
                </BarChart>
              </ResponsiveContainer></div>
            </Card>
          </>
        )}

        {/* Personajes */}
        {levels.length > 0 && (
          <Card>
            <p className="eyebrow mb-3">Sus personajes crecen con lo que hacen</p>
            <div className="space-y-3">
              {levels.map(l => {
                const lv = levelFromXp(l.xp)
                const col = colorFor(l.user_id, l.user_id === uid ? partner?.id : uid)
                return (
                  <div key={l.user_id} className="flex items-center gap-3">
                    <Character profile={l.user_id === uid ? profile : partner} stage={stageForLevel(lv.level)} color={col} mood="idle" size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between"><span className="text-[14px] font-semibold">{l.user_id === uid ? 'Tú' : pName} · Nivel {lv.level}</span><span className="tabular muted text-[12px]">{lv.need - lv.into} XP para subir</span></div>
                      <ProgressBar className="mt-1.5" value={lv.into} max={lv.need} color={col === 'rojo' ? 'bg-gradient-to-r from-rose-300 to-fuego-500' : 'bg-gradient-to-r from-amber-300 to-orange-500'} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
        <p className="muted text-center text-xs">Cada uno a su ritmo: lo importante es sumar juntos. 💞 Tu pareja solo ve totales, nunca tus registros detallados.</p>
      </div>
    </div>
  )
}
