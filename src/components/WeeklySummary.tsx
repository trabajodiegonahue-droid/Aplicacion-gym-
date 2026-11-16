import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Crown } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useToday } from '../lib/queries'
import { addDays, fmtLiters, fmtNum, fmtShort, startOfWeek } from '../lib/dates'
import { colorFor, levelFromXp, stageForLevel } from '../lib/levels'
import { Card, Segmented, Sheet, cx } from './ui'
import { Character } from './Character'
import { CountUp } from './Motion'

interface WeekRow { user_id: string; xp: number; workouts: number; activity_minutes: number; water_ml: number; habit_checks: number; days_completed: number; couple_days: number; records: number; workout_minutes: number; steps: number }

function useWeek(from: string | null, to: string | null) {
  const { uid, couple } = useAuth()
  return useQuery({
    queryKey: ['stats', 'week', uid, couple?.id, from, to], enabled: !!uid && !!from && !!to,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        must(supabase.rpc('week_summary', { p_from: from, p_to: to })) as Promise<Record<string, number | string>[]>,
        must(supabase.rpc('couple_stats', { p_from: from, p_to: to })) as Promise<Record<string, number | string>[]>,
      ])
      return a.map(r => {
        const s = b.find(x => x.user_id === r.user_id) ?? {}
        const num = (v: unknown) => Number(v ?? 0)
        return {
          user_id: String(r.user_id), xp: num(r.xp), workouts: num(r.workouts), activity_minutes: num(r.activity_minutes), water_ml: num(r.water_ml),
          habit_checks: num(r.habit_checks), days_completed: num(r.days_completed), couple_days: num(r.couple_days), records: num(r.records),
          workout_minutes: num(s.workout_minutes), steps: num(s.steps),
        } as WeekRow
      })
    },
  })
}

const seenKey = (uid: string | null | undefined, ws: string) => `fj-weekly-seen-${uid}-${ws}`

/** Tarjeta en Inicio + hoja con el resumen. Se abre sola el lunes (una vez) y desde el aviso del domingo. */
export function WeeklySummary() {
  const { uid } = useAuth()
  const today = useToday()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [which, setWhich] = useState<'this' | 'last'>('this')
  const ws = today ? startOfWeek(today) : null
  const isMonday = !!today && today === ws

  // Aviso del domingo → /?semana=1
  useEffect(() => {
    if (!today || !ws) return
    if (new URLSearchParams(loc.search).get('semana')) {
      setWhich(isMonday ? 'last' : 'this'); setOpen(true)
      nav(loc.pathname, { replace: true })
    }
  }, [today, ws, isMonday, loc.search, loc.pathname, nav])

  // Los lunes se abre solo (una vez) con la semana pasada, si tuvieron actividad
  // y no hay otra ventana abierta.
  const lastQ = useWeek(isMonday && ws ? addDays(ws, -7) : null, isMonday && ws ? addDays(ws, -1) : null)
  const lastXp = (lastQ.data ?? []).reduce((a, r) => a + r.xp, 0)
  useEffect(() => {
    if (!isMonday || !ws || lastXp <= 0) return
    try { if (localStorage.getItem(seenKey(uid, ws)) === '1') return } catch { return }
    const t = setTimeout(() => {
      if (document.querySelector('[data-sheet], [role="dialog"], [data-confirm]')) return
      try { localStorage.setItem(seenKey(uid, ws), '1') } catch { /* */ }
      setWhich('last'); setOpen(true)
    }, 2200)
    return () => clearTimeout(t)
  }, [isMonday, ws, lastXp, uid])

  const thisQ = useWeek(ws, today)
  const rows = thisQ.data ?? []
  const totalXp = rows.reduce((a, r) => a + r.xp, 0)
  const coupleDays = rows[0]?.couple_days ?? 0
  const daysSoFar = today && ws ? Math.round((new Date(today).getTime() - new Date(ws).getTime()) / 86400000) + 1 : 7

  return (
    <>
      <Card onClick={() => { setWhich(isMonday ? 'last' : 'this'); setOpen(true) }} className="flex items-center gap-3" data-tour="weekly">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-300 to-fuego-500 text-[20px] text-white shadow-sm">📊</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{isMonday ? 'Resumen de la semana pasada' : 'Su semana'}</p>
          <p className="muted truncate text-[13px]">{isMonday ? 'Toca para ver quién fue el MVP 👑' : `+${fmtNum(totalXp)} XP juntos · ${coupleDays}/${daysSoFar} días de racha`}</p>
        </div>
        <ChevronRight className="size-5 text-fuego-800/40" />
      </Card>
      {open && today && ws && <WeekSheet which={which} setWhich={setWhich} today={today} ws={ws} onClose={() => setOpen(false)} />}
    </>
  )
}

function WeekSheet({ which, setWhich, today, ws, onClose }: { which: 'this' | 'last'; setWhich: (w: 'this' | 'last') => void; today: string; ws: string; onClose: () => void }) {
  const { uid, partner, profile } = useAuth()
  const from = which === 'this' ? ws : addDays(ws, -7)
  const to = which === 'this' ? today : addDays(ws, -1)
  const q = useWeek(from, to)
  const rows = q.data ?? []
  const me = rows.find(r => r.user_id === uid)
  const them = rows.find(r => r.user_id === partner?.id)
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  const mvp = me && them && me.xp !== them.xp ? (me.xp > them.xp ? 'me' : 'them') : null
  const people = [
    { key: 'me', row: me, p: profile, name: profile?.display_name ?? 'Tú', color: colorFor(uid, partner?.id) },
    ...(partner ? [{ key: 'them', row: them, p: partner, name: partner.display_name ?? 'Pareja', color: colorFor(partner.id, uid) }] : []),
  ]
  const stats: { label: string; get: (r: WeekRow) => number; fmt: (n: number) => string }[] = [
    { label: '🏋️ Entrenos', get: r => r.workouts, fmt: n => String(n) },
    { label: '⏱️ Min. de entreno', get: r => r.workout_minutes, fmt: n => `${n} min` },
    { label: '🏃 Actividad', get: r => r.activity_minutes, fmt: n => `${n} min` },
    { label: '👣 Pasos', get: r => r.steps, fmt: n => fmtNum(n) },
    { label: '💧 Agua', get: r => r.water_ml, fmt: n => fmtLiters(n) },
    { label: '✅ Hábitos', get: r => r.habit_checks, fmt: n => String(n) },
    { label: '🏅 Récords nuevos', get: r => r.records, fmt: n => String(n) },
  ]
  return (
    <Sheet open onClose={onClose} title="Su semana 🔥">
      <div className="space-y-4" data-testid="weekly-sheet">
        <Segmented value={which} onChange={v => setWhich(v as 'this' | 'last')} options={[{ value: 'this', label: 'Esta semana' }, { value: 'last', label: 'Semana pasada' }]} />
        <p className="muted -mt-1 text-center text-[13px]">{fmtShort(from)} – {fmtShort(to)}</p>

        <div className="card relative overflow-hidden p-0">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-100 via-rose-50 to-transparent dark:from-noche-700 dark:via-noche-800" />
          <div className="relative flex items-end justify-around px-3 pb-3 pt-5">
            {people.map(x => {
              const lvl = levelFromXp(x.row?.xp ?? 0)
              const win = mvp === x.key
              return (
                <div key={x.key} className="flex flex-col items-center">
                  <div className="relative">
                    {win && <Crown className="absolute -top-4 left-1/2 size-7 -translate-x-1/2 fill-amber-300 text-amber-500 animate-pop" />}
                    <Character profile={x.p} color={x.color} stage={stageForLevel(lvl.level)} mood={win || !mvp ? 'cheer' : 'happy'} size={win ? 96 : 84} />
                  </div>
                  <p className="mt-1 text-[14px] font-bold">{x.name}</p>
                  <p className="text-[13px] font-semibold text-fuego-600 dark:text-fuego-300">+<CountUp value={x.row?.xp ?? 0} /> XP</p>
                  {win && <span className="chip mt-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">MVP de la semana</span>}
                </div>
              )
            })}
          </div>
          {!mvp && me && them && <p className="relative pb-3 text-center text-[13px] font-semibold">¡Empate! Equipo perfecto 💞</p>}
        </div>

        {partner && (
          <div className="card">
            <p className="text-[14px] font-bold">🔥 Racha juntos</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="tabular text-[32px] font-bold leading-none"><CountUp value={me?.couple_days ?? 0} /></span>
              <span className="muted pb-1 text-[13px]">de {days} días los dos cumplieron</span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: days }, (_, i) => <span key={i} className={cx('h-2 flex-1 rounded-full', i < (me?.couple_days ?? 0) ? 'bg-ember' : 'bg-fuego-100 dark:bg-noche-700')} />)}
            </div>
          </div>
        )}

        <div className="card space-y-3">
          {q.isLoading ? <p className="muted text-sm">Cargando…</p> : stats.map(s => {
            const vals = people.map(x => (x.row ? s.get(x.row) : 0))
            const max = Math.max(1, ...vals)
            return (
              <div key={s.label}>
                <p className="text-[13px] font-semibold">{s.label}</p>
                <div className="mt-1 space-y-1">
                  {people.map((x, i) => (
                    <div key={x.key} className="flex items-center gap-2">
                      <span className="muted w-14 truncate text-[11.5px]">{x.name}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700">
                        <div className={cx('bar-grow h-full rounded-full', x.color === 'rojo' ? 'bg-rose-500' : 'bg-orange-400')} style={{ width: `${Math.max(vals[i] > 0 ? 6 : 0, (vals[i] / max) * 100)}%` }} />
                      </div>
                      <span className="tabular w-16 text-right text-[12.5px] font-semibold">{s.fmt(vals[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p className="muted text-center text-[12px]">Cada domingo a las 19:00 les llega este resumen (puedes apagarlo en Perfil → Notificaciones).</p>
      </div>
    </Sheet>
  )
}
