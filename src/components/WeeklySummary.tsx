import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Heart } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useToday } from '../lib/queries'
import { addDays, fmtLiters, fmtNum, fmtShort, startOfWeek } from '../lib/dates'
import { colorFor, levelFromXp, stageForLevel } from '../lib/levels'
import { Button, Card, Segmented, Sheet, cx } from './ui'
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
    try { if (localStorage.getItem(seenKey(uid, ws)) === '1' || localStorage.getItem('fj-no-prompts') === '1') return } catch { return }
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
          <p className="muted truncate text-[13px]">{isMonday ? 'Toca para ver lo que lograron juntos 💞' : `+${fmtNum(totalXp)} XP juntos · ${coupleDays}/${daysSoFar} días de racha`}</p>
        </div>
        <ChevronRight className="size-5 text-fuego-800/40" />
      </Card>
      {open && today && ws && <WeekSheet which={which} setWhich={setWhich} today={today} ws={ws} onClose={() => setOpen(false)} />}
    </>
  )
}

function WeekSheet({ which, setWhich, today, ws, onClose }: { which: 'this' | 'last'; setWhich: (w: 'this' | 'last') => void; today: string; ws: string; onClose: () => void }) {
  const { uid, partner, profile } = useAuth()
  const nav = useNavigate()
  const from = which === 'this' ? ws : addDays(ws, -7)
  const to = which === 'this' ? today : addDays(ws, -1)
  const q = useWeek(from, to)
  const prev = useWeek(addDays(from, -7), addDays(to, -7)) // mismos días de la semana anterior
  const rows = q.data ?? []
  const prevRows = prev.data ?? []
  const me = rows.find(r => r.user_id === uid)
  const them = rows.find(r => r.user_id === partner?.id)
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  const sum = (list: WeekRow[], f: (r: WeekRow) => number) => list.reduce((a, r) => a + f(r), 0)
  const teamXp = sum(rows, r => r.xp)
  const coupleDays = me?.couple_days ?? 0
  const people = [
    { key: 'me', row: me, p: profile, name: profile?.display_name ?? 'Tú', color: colorFor(uid, partner?.id) },
    ...(partner ? [{ key: 'them', row: them, p: partner, name: partner.display_name ?? 'Pareja', color: colorFor(partner.id, uid) }] : []),
  ]
  const tiles: { icon: string; label: string; get: (r: WeekRow) => number; fmt: (n: number) => string }[] = [
    { icon: '🏋️', label: 'Entrenos', get: r => r.workouts, fmt: n => String(n) },
    { icon: '⏱️', label: 'Minutos en movimiento', get: r => r.workout_minutes + r.activity_minutes, fmt: n => `${fmtNum(n)}` },
    { icon: '👣', label: 'Pasos', get: r => r.steps, fmt: n => fmtNum(n) },
    { icon: '💧', label: 'Agua', get: r => r.water_ml, fmt: n => fmtLiters(n) },
    { icon: '✅', label: 'Hábitos cumplidos', get: r => r.habit_checks, fmt: n => String(n) },
    { icon: '🏅', label: 'Récords nuevos', get: r => r.records, fmt: n => String(n) },
  ]
  // Lo mejor de cada uno: sus propios logros, sin comparar con el otro
  const highlights = (r?: WeekRow) => {
    if (!r) return []
    const out: string[] = []
    if (r.workouts) out.push(`${r.workouts} ${r.workouts === 1 ? 'entreno' : 'entrenos'} 💪`)
    if (r.records) out.push(`${r.records} ${r.records === 1 ? 'récord nuevo' : 'récords nuevos'} 🏅`)
    if (r.activity_minutes) out.push(`${r.activity_minutes} min de actividad 🏃`)
    if (r.water_ml >= 1000) out.push(`${fmtLiters(r.water_ml)} de agua 💧`)
    if (r.habit_checks) out.push(`${r.habit_checks} hábitos ✅`)
    return out.slice(0, 3)
  }
  const message = coupleDays >= days ? '¡Semana perfecta! Cumplieron los dos todos los días 🔥' : coupleDays >= Math.ceil(days * 0.6) ? '¡Gran semana en equipo! Sigan así de la mano 💞' : coupleDays > 0 ? 'Cada día juntos suma. ¡La próxima semana, a por más! ✨' : 'Una semana nueva es una oportunidad nueva. ¡Juntos pueden! 🌱'
  return (
    <Sheet open onClose={onClose} title="Su semana juntos 💞">
      <div className="space-y-4" data-testid="weekly-sheet">
        <Segmented value={which} onChange={v => setWhich(v as 'this' | 'last')} options={[{ value: 'this', label: 'Esta semana' }, { value: 'last', label: 'Semana pasada' }]} />
        <p className="muted -mt-1 text-center text-[13px]">{fmtShort(from)} – {fmtShort(to)}</p>

        <div className="card relative overflow-hidden p-0">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-100 via-rose-50 to-transparent dark:from-noche-700 dark:via-noche-800" />
          <div className="relative flex items-end justify-center gap-1 px-3 pt-5">
            {people.map((x, i) => (
              <div key={x.key} className="flex flex-col items-center">
                <Character profile={x.p} color={x.color} stage={stageForLevel(levelFromXp(x.row?.xp ?? 0).level)} mood={coupleDays > 0 ? 'love' : 'happy'} size={88} />
                <p className="mt-1 text-[13px] font-semibold">{x.name}</p>
                {i === 0 && people.length > 1 && <span className="sr-only">y</span>}
              </div>
            )).flatMap((el, i) => i === 0 && people.length > 1 ? [el, <Heart key="h" className="heartbeat mb-10 size-7 shrink-0 fill-fuego-500 text-fuego-500" />] : [el])}
          </div>
          <div className="relative pb-4 pt-2 text-center">
            <p className="eyebrow">Juntos sumaron</p>
            <p className="font-display text-[34px] font-bold leading-tight text-fuego-600 dark:text-fuego-300">+<CountUp value={teamXp} /> XP</p>
            <p className="mx-auto mt-1 max-w-[280px] text-[14px] font-medium">{message}</p>
          </div>
        </div>

        {partner && (
          <div className="card">
            <p className="text-[14px] font-bold">🔥 Días que cumplieron los dos</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="tabular font-display text-[34px] font-bold leading-none"><CountUp value={coupleDays} /></span>
              <span className="muted pb-1 text-[13px]">de {days} {days === 1 ? 'día' : 'días'}</span>
            </div>
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: days }, (_, i) => <span key={i} style={{ animationDelay: `${i * 70}ms` }} className={cx('stagger-dot h-2.5 flex-1 rounded-full', i < coupleDays ? 'bg-ember' : 'bg-fuego-100 dark:bg-noche-700')} />)}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 px-1 text-[14px] font-bold">Lo que lograron en equipo</p>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(t => {
              const now = sum(rows, t.get), before = sum(prevRows, t.get)
              const diff = now - before
              return (
                <div key={t.label} className="card p-3">
                  <p className="text-[12px] font-medium text-fuego-800/80 dark:text-white/60">{t.icon} {t.label}</p>
                  <p className="tabular font-display mt-1 text-[22px] font-bold leading-none">{t.fmt(now)}</p>
                  {prev.data && (before > 0 || now > 0) && (
                    <p className={cx('mt-1 text-[11.5px] font-semibold', diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'muted')}>
                      {diff > 0 ? `▲ ${t.fmt(diff)} más que la semana anterior` : diff === 0 ? 'Igual que la semana anterior' : 'Semana más tranquila'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {people.some(x => highlights(x.row).length) && (
          <div className="card">
            <p className="text-[14px] font-bold">💞 Lo mejor de cada uno</p>
            <div className="mt-2 space-y-2">
              {people.map(x => highlights(x.row).length > 0 && (
                <div key={x.key} className="flex items-start gap-2 rounded-xl bg-fuego-50 p-2.5 dark:bg-noche-700/60">
                  <span className="font-semibold">{x.name}:</span>
                  <span className="text-[14px]">{highlights(x.row).join(' · ')}</span>
                </div>
              ))}
            </div>
            <p className="muted mt-2 text-[12px]">Cada uno a su ritmo: lo que importa es que suman juntos.</p>
          </div>
        )}
        <Button variant="soft" className="w-full" onClick={() => { onClose(); nav('/calendario') }}>🗓️ Planear la próxima semana juntos</Button>
        <p className="muted text-center text-[12px]">Cada domingo a las 19:00 les llega este resumen (puedes apagarlo en Perfil → Notificaciones).</p>
      </div>
    </Sheet>
  )
}
