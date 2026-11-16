import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Scale, ChevronRight } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useToday } from '../lib/queries'
import { diffDays, fmtShort, startOfWeek } from '../lib/dates'
import { Button, Card, Field, Input, Sheet, cx } from './ui'

export interface BodyWeightRow { id: string; day: string; weight_kg: number; height_cm: number | null }
type Goal = 'bajar_grasa' | 'ganar_musculo' | 'mantener' | 'salud' | 'rendimiento'
export const FITNESS_GOALS: Record<Goal, string> = {
  bajar_grasa: '🔥 Bajar grasa', ganar_musculo: '💪 Ganar músculo', mantener: '⚖️ Mantenerme', salud: '❤️ Salud y energía', rendimiento: '🏃 Rendir más',
}
type ProfileBody = { height_cm?: number | null; goal_weight_kg?: number | null; start_weight_kg?: number | null; fitness_goal?: Goal | null }

export function useBodyWeights() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['body_weights', uid], enabled: !!uid,
    queryFn: async () => ((await must(supabase.from('body_weights').select('id, day, weight_kg, height_cm').order('day', { ascending: true }).limit(400))) as BodyWeightRow[])
      .map(x => ({ ...x, weight_kg: Number(x.weight_kg), height_cm: x.height_cm == null ? null : Number(x.height_cm) })),
  })
}

export const bmi = (kg: number, cm: number | null | undefined) => (cm ? kg / ((cm / 100) ** 2) : null)
export function bmiLabel(b: number) {
  return b < 18.5 ? 'bajo' : b < 25 ? 'saludable' : b < 30 ? 'sobrepeso' : 'alto'
}

/** Formulario de datos corporales: primera vez (completo) o pesaje semanal (rápido). */
export function BodyDataSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'inicio' | 'semanal' }) {
  const { uid, profile } = useAuth()
  const p = profile as unknown as ProfileBody | null
  const today = useToday()
  const list = useBodyWeights().data ?? []
  const last = list[list.length - 1]
  const [f, setF] = useState({ weight: '', height: '', goal: '', waist: '', fitness: '' as Goal | '' })
  useEffect(() => {
    if (open) setF({
      weight: last ? String(last.weight_kg) : '', height: String(last?.height_cm ?? p?.height_cm ?? ''), goal: String(p?.goal_weight_kg ?? ''), waist: '', fitness: p?.fitness_goal ?? '',
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  const save = useAction(async () => {
    const w = num(f.weight), h = num(f.height)
    if (!w || w < 20 || w > 400) throw new Error('Escribe tu peso en kg (ej.: 72,5)')
    if (h != null && (h < 100 || h > 250)) throw new Error('La estatura va en centímetros (ej.: 170)')
    await must(supabase.from('body_weights').upsert({ user_id: uid, day: today, weight_kg: w, height_cm: h }, { onConflict: 'user_id,day' }))
    const patch: Record<string, unknown> = {}
    if (h) patch.height_cm = h
    if (mode === 'inicio' || f.goal) patch.goal_weight_kg = num(f.goal)
    if (f.fitness) patch.fitness_goal = f.fitness
    if (Object.keys(patch).length) await must(supabase.from('profiles').update(patch).eq('id', uid!))
    const waist = num(f.waist)
    if (waist) await must(supabase.from('measurements').upsert({ user_id: uid, day: today, waist_cm: waist }, { onConflict: 'user_id,day' }))
  }, { invalidate: [['body_weights'], ['profile'], ['life']], success: mode === 'inicio' ? '¡Listo! Ya podemos medir tu progreso 📈' : 'Pesaje guardado ⚖️' })
  const prevW = list.length > 1 || (last && last.day !== today) ? last : undefined
  const w = num(f.weight)
  const diff = prevW && w ? w - prevW.weight_kg : null
  return (
    <Sheet open={open} onClose={onClose} title={mode === 'inicio' ? 'Tus datos para medir el progreso 📈' : 'Pesaje semanal ⚖️'}>
      <form className="space-y-3" data-testid="body-sheet" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }) }}>
        <p className="muted text-[13.5px]">{mode === 'inicio' ? 'Con esto la app arma tus gráficas de peso, estatura e IMC semana a semana.' : 'Una vez por semana, mejor en ayunas y a la misma hora. Así las gráficas son confiables.'}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Peso (kg)"><Input required inputMode="decimal" value={f.weight} onChange={e => setF({ ...f, weight: e.target.value })} placeholder="72,5" autoFocus /></Field>
          <Field label="Estatura (cm)"><Input inputMode="decimal" value={f.height} onChange={e => setF({ ...f, height: e.target.value })} placeholder="170" /></Field>
        </div>
        {diff != null && Math.abs(diff) < 30 && <p className={cx('text-[13px] font-semibold', diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-orange-500' : 'muted')}>{diff === 0 ? 'Igual que la última vez' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg desde el ${fmtShort(prevW!.day)}`}</p>}
        {mode === 'inicio' && (
          <div>
            <p className="label">Tu objetivo</p>
            <div className="flex flex-wrap gap-1.5">{(Object.keys(FITNESS_GOALS) as Goal[]).map(g => (
              <button key={g} type="button" onClick={() => setF({ ...f, fitness: g })} className={cx('rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-95', f.fitness === g ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')}>{FITNESS_GOALS[g]}</button>
            ))}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Peso objetivo (opcional)"><Input inputMode="decimal" value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })} placeholder="kg" /></Field>
          <Field label="Cintura (opcional)"><Input inputMode="decimal" value={f.waist} onChange={e => setF({ ...f, waist: e.target.value })} placeholder="cm" /></Field>
        </div>
        <p className="muted text-[12px]">🔒 Peso, estatura y medidas son privados: tu pareja nunca los ve.</p>
        <Button type="submit" variant="ember" className="w-full min-h-14" loading={save.isPending}>Guardar</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>Ahora no</Button>
      </form>
    </Sheet>
  )
}

/** Pide los datos al entrar (si faltan) y el pesaje una vez por semana. Va dentro del AppShell. */
export function BodyCheckPrompt() {
  const { uid, profile } = useAuth()
  const today = useToday()
  const q = useBodyWeights()
  const [mode, setMode] = useState<'inicio' | 'semanal' | null>(null)
  const p = profile as unknown as ProfileBody | null
  const list = q.data
  const last = list?.[list.length - 1]
  const missing = !!profile && !!list && (!p?.height_cm || list.length === 0)
  const due = !!last && !!today && diffDays(today, last.day) >= 7
  useEffect(() => {
    if (!uid || !today || !list || !profile || (!missing && !due)) return
    const ws = startOfWeek(today)
    const key = missing ? `fj-bodydata-asked-${uid}-${today}` : `fj-weighin-asked-${uid}-${ws}`
    try { if (localStorage.getItem(key) === '1' || localStorage.getItem('fj-no-prompts') === '1') return } catch { return }
    const ready = () => { try { return localStorage.getItem(`fj-onboarded-${uid}`) === '1' && localStorage.getItem(`fj-tour-${uid}`) === '1' } catch { return false } }
    let tries = 0
    const t = setInterval(() => {
      if (++tries > 240) return clearInterval(t)
      // espera a que terminen la bienvenida y el tour, y a que no haya otra ventana abierta
      if (!ready() || document.querySelector('[data-sheet], [role="dialog"], [data-confirm], .fixed.inset-0.z-\\[95\\]')) return
      clearInterval(t)
      try { localStorage.setItem(key, '1') } catch { /* */ }
      setMode(missing ? 'inicio' : 'semanal')
    }, 2500)
    return () => clearInterval(t)
  }, [uid, today, list, profile, missing, due])
  return <BodyDataSheet open={!!mode} mode={mode ?? 'semanal'} onClose={() => setMode(null)} />
}

/** Tarjeta en Inicio: último pesaje, IMC y cuánto falta para el objetivo. */
export function WeighInCard() {
  const { profile } = useAuth()
  const p = profile as unknown as ProfileBody | null
  const today = useToday()
  const list = useBodyWeights().data ?? []
  const [open, setOpen] = useState(false)
  const last = list[list.length - 1]
  const days = last && today ? diffDays(today, last.day) : null
  const due = !last || (days ?? 0) >= 7
  const b = last ? bmi(last.weight_kg, last.height_cm ?? p?.height_cm) : null
  const toGoal = last && p?.goal_weight_kg ? Number(p.goal_weight_kg) - last.weight_kg : null
  return (
    <>
      <Card onClick={() => setOpen(true)} className={cx('flex items-center gap-3', due && 'ring-2 ring-amber-300/70')} data-testid="weighin-card">
        <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-2xl', due ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-fuego-100 text-fuego-600 dark:bg-noche-700')}><Scale className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{due ? (last ? 'Toca tu pesaje semanal ⚖️' : 'Registra tu peso y estatura') : `${last!.weight_kg.toFixed(1)} kg${b ? ` · IMC ${b.toFixed(1)}` : ''}`}</p>
          <p className="muted truncate text-[13px]">{!last ? 'Para ver tu progreso semana a semana' : due ? `Último: ${last.weight_kg.toFixed(1)} kg hace ${days} días` : `${days === 0 ? 'Hoy' : `Hace ${days} días`}${toGoal != null ? ` · ${Math.abs(toGoal) < 0.1 ? '¡en tu objetivo! 🎯' : `${Math.abs(toGoal).toFixed(1)} kg para tu objetivo`}` : ''}`}</p>
        </div>
        <ChevronRight className="size-5 text-fuego-800/40" />
      </Card>
      <BodyDataSheet open={open} mode={!last || !p?.height_cm ? 'inicio' : 'semanal'} onClose={() => setOpen(false)} />
    </>
  )
}
