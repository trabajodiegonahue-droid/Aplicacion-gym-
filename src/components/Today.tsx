import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Moon, Timer, XCircle, Dumbbell, Droplets, Footprints, Activity, ListChecks, Plus, Check, Bike, Waves, Trophy, Flower2, Zap, Sparkles, PersonStanding, GlassWater, Milk, Coffee, type LucideIcon } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { LOG_KEYS, useAction, useToday } from '../lib/queries'
import type { ActivityKind, MemberDay, MemberStatus, Rules, WaterPreset } from '../lib/types'
import { fmtLiters, fmtNum, localDateTimeToISO, nowTimeHHMM, toISODate } from '../lib/dates'
import { Button, Field, Input, Ring, Segmented, Sheet, cx } from './ui'
import { Avatar } from './Avatar'
import { celebrate } from './Celebration'

export const STATUS: Record<MemberStatus | 'recovered', { label: string; dot: string; icon: typeof Circle }> = {
  pending: { label: 'Pendiente', dot: 'bg-fuego-300', icon: Circle },
  in_progress: { label: 'En progreso', dot: 'bg-amber-400', icon: Timer },
  completed: { label: 'Completado', dot: 'bg-emerald-500', icon: CheckCircle2 },
  rest: { label: 'Descanso', dot: 'bg-sky-400', icon: Moon },
  missed: { label: 'No cumplido', dot: 'bg-fuego-800/40', icon: XCircle },
  recovered: { label: 'Recuperado', dot: 'bg-violet-400', icon: CheckCircle2 },
}

export function StatusChip({ status }: { status: MemberStatus | 'recovered' }) {
  const s = STATUS[status]
  return <span className="chip"><span className={cx('size-1.5 rounded-full', s.dot)} />{s.label}</span>
}

export const CONDITION_LABEL: Record<string, string> = {
  workout: 'Entreno', activity: 'Actividad', steps: 'Pasos', water: 'Agua', habits: 'Hábitos',
}

export function conditionText(r: Rules) {
  const items: string[] = []
  if (r.conditions.workout) items.push(r.min_workout_minutes > 0 ? `entrenar ≥ ${r.min_workout_minutes} min` : 'registrar un entrenamiento')
  if (r.conditions.activity) items.push(`${r.min_activity_minutes} min de actividad`)
  if (r.conditions.steps) items.push(`${fmtNum(r.min_steps)} pasos`)
  if (r.conditions.water) items.push(`beber ${fmtLiters(r.min_water_ml)}`)
  if (r.conditions.habits) items.push(`${r.min_habit_checks} hábito(s) marcados`)
  const joiner = r.require === 'any' ? ' o ' : ' y '
  return (r.require === 'any' && items.length > 1 ? 'Al menos una: ' : r.require === 'all' && items.length > 1 ? 'Todas: ' : '') + items.join(joiner)
}

/** Progreso del día (0..1) hacia lo que piden las reglas. */
export function dayProgress(row?: MemberDay, rules?: Rules | null) {
  if (!row) return 0
  if (row.status === 'completed' || row.status === 'rest') return 1
  if (!rules) return 0
  const d = row.details
  const f: Record<string, number> = {
    workout: d.workouts >= 1 ? 1 : 0,
    activity: Math.min(1, d.activity_minutes / Math.max(1, rules.min_activity_minutes)),
    steps: Math.min(1, d.steps / Math.max(1, rules.min_steps)),
    water: Math.min(1, d.water_ml / Math.max(1, rules.min_water_ml)),
    habits: Math.min(1, d.habit_checks / Math.max(1, rules.min_habit_checks)),
  }
  const vals = (d.required ?? []).map(k => f[k] ?? 0)
  if (!vals.length) return 0
  return rules.require === 'any' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length
}

/** Anillo de progreso de una persona (estilo "anillos de actividad"). */
export function PartnerRing({ row, rules, name, avatar, me, size = 112 }: { row?: MemberDay; rules?: Rules | null; name: string; avatar?: string | null; me?: boolean; size?: number }) {
  const st = row?.status ?? 'pending'
  const p = dayProgress(row, rules)
  const color = st === 'completed' ? '#10b981' : st === 'rest' ? '#38bdf8' : '#e11d48'
  const icons: Record<string, typeof Dumbbell> = { workout: Dumbbell, activity: Activity, steps: Footprints, water: Droplets, habits: ListChecks }
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <Ring value={p} max={1} size={size} stroke={7} color={color}>
        <Avatar path={avatar} name={name} size={size - 30} />
        {st === 'completed' && <span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white ring-[3px] ring-white dark:ring-noche-800"><Check className="size-4" strokeWidth={3} /></span>}
        {st === 'rest' && <span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full bg-sky-400 text-white ring-[3px] ring-white dark:ring-noche-800"><Moon className="size-3.5" strokeWidth={2.5} /></span>}
      </Ring>
      <p className="mt-2.5 text-[15px] font-semibold">{me ? 'Tú' : name}</p>
      <p className="muted text-[12px]">{STATUS[st].label}{st !== 'completed' && st !== 'rest' && p > 0 ? ` · ${Math.round(p * 100)}%` : ''}</p>
      {row?.details && (
        <div className="mt-2 flex gap-1">
          {row.details.required.map(k => {
            const I = icons[k] ?? Circle
            const ok = row.details.met.includes(k)
            return <span key={k} title={CONDITION_LABEL[k]} className={cx('flex size-6 items-center justify-center rounded-full', ok ? 'bg-emerald-500/12 text-emerald-600' : 'bg-fuego-100 text-fuego-800/45 dark:bg-noche-700 dark:text-white/35')}><I className="size-3.5" /></span>
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Registro rápido
// ---------------------------------------------------------------------
export function useWaterToday() {
  const { uid } = useAuth()
  const today = useToday()
  return useQuery({
    queryKey: ['water', uid, today],
    enabled: !!uid && !!today,
    queryFn: async () => {
      const rows = await must(supabase.from('water_logs').select('amount_ml').eq('local_day', today!)) as { amount_ml: number }[]
      return Math.max(0, rows.reduce((s, r) => s + r.amount_ml, 0))
    },
  })
}

export function useWaterPresets() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['water_presets', uid],
    enabled: !!uid,
    queryFn: () => must(supabase.from('water_presets').select('*').order('position')) as Promise<WaterPreset[]>,
  })
}

export function useAddWater() {
  const { uid } = useAuth()
  return useAction(async (v: { ml: number; label?: string }) => {
    await must(supabase.from('water_logs').insert({ user_id: uid, amount_ml: v.ml, label: v.label ?? null }))
    return v.ml
  }, { invalidate: [['water'], ['water_history'], ...LOG_KEYS], success: ml => ml > 0 ? `+${ml} ml 💧` : `${ml} ml` })
}

export function QuickWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const [title, setTitle] = useState('Entrenamiento')
  const [minutes, setMinutes] = useState('45')
  const [date, setDate] = useState(toISODate(new Date()))
  const [time, setTime] = useState(nowTimeHHMM())
  const [notes, setNotes] = useState('')
  const save = useAction(async () => {
    await must(supabase.from('workouts').insert({ user_id: uid, title: title.trim() || 'Entrenamiento', duration_min: Number(minutes) || null, notes: notes || null, performed_at: localDateTimeToISO(date, time) }))
  }, { invalidate: [['workouts'], ...LOG_KEYS], success: '¡Entrenamiento registrado! 💪' })
  return (
    <Sheet open={open} onClose={onClose} title="Registrar entrenamiento">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: () => { celebrate(['💪', '🔥']); onClose() } }) }}>
        <Field label="¿Qué entrenaste?"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></Field>
        <Field label="Duración (minutos)"><Input type="number" inputMode="numeric" min={0} max={1440} value={minutes} onChange={e => setMinutes(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha"><Input type="date" value={date} max={toISODate(new Date())} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Notas (opcional)"><Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} /></Field>
        <p className="muted text-xs">Para registrar series, repeticiones y pesos usa la sección Gimnasio. Los registros de días ya cerrados quedan en tu historial pero no cambian la racha.</p>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
      </form>
    </Sheet>
  )
}

export const ACTIVITY_KINDS: { value: ActivityKind; label: string; icon: LucideIcon }[] = [
  { value: 'caminata', label: 'Caminata', icon: PersonStanding }, { value: 'correr', label: 'Correr', icon: Zap },
  { value: 'bicicleta', label: 'Bicicleta', icon: Bike }, { value: 'cardio', label: 'Cardio', icon: Activity },
  { value: 'natacion', label: 'Natación', icon: Waves }, { value: 'deporte', label: 'Deporte', icon: Trophy },
  { value: 'yoga', label: 'Yoga', icon: Flower2 }, { value: 'pasos', label: 'Pasos', icon: Footprints },
  { value: 'otro', label: 'Otro', icon: Sparkles },
]
export const presetIcon = (icon: string): LucideIcon => icon === 'bottle' ? Milk : icon === 'cup' ? Coffee : GlassWater

export function ActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const [kind, setKind] = useState<ActivityKind>('caminata')
  const [minutes, setMinutes] = useState('30')
  const [steps, setSteps] = useState('')
  const [km, setKm] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [time, setTime] = useState(nowTimeHHMM())
  const [notes, setNotes] = useState('')
  const save = useAction(async () => {
    await must(supabase.from('activity_logs').insert({
      user_id: uid, kind, minutes: Number(minutes) || 0, steps: Number(steps) || 0, distance_km: km ? Number(km) : null,
      notes: notes || null, performed_at: localDateTimeToISO(date, time),
    }))
  }, { invalidate: [['activity'], ...LOG_KEYS], success: 'Actividad registrada 🏃' })
  return (
    <Sheet open={open} onClose={onClose} title="Registrar actividad">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }) }}>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_KINDS.map(k => (
            <button type="button" key={k.value} onClick={() => setKind(k.value)}
              className={cx('flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[12px] font-medium transition', kind === k.value ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white ring-1 ring-black/[.05] dark:bg-noche-800')}>
              <k.icon className="size-5" strokeWidth={1.8} />{k.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Minutos"><Input type="number" inputMode="numeric" min={0} value={minutes} onChange={e => setMinutes(e.target.value)} /></Field>
          <Field label="Pasos"><Input type="number" inputMode="numeric" min={0} value={steps} onChange={e => setSteps(e.target.value)} /></Field>
          <Field label="Km"><Input type="number" inputMode="decimal" step="0.01" min={0} value={km} onChange={e => setKm(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha"><Input type="date" value={date} max={toISODate(new Date())} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Notas"><Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} /></Field>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
      </form>
    </Sheet>
  )
}

export function WaterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const presets = useWaterPresets().data ?? []
  const add = useAddWater()
  const [custom, setCustom] = useState('')
  const [sign, setSign] = useState<'add' | 'remove'>('add')
  return (
    <Sheet open={open} onClose={onClose} title="Agua">
      <Segmented value={sign} onChange={setSign} options={[{ value: 'add', label: 'Añadir' }, { value: 'remove', label: 'Quitar' }]} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {presets.map(p => (
          <button key={p.id} onClick={() => add.mutate({ ml: sign === 'add' ? p.amount_ml : -p.amount_ml, label: p.label })}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white text-[13px] font-medium ring-1 ring-black/[.05] active:scale-95 dark:bg-noche-800">
            {(() => { const I = presetIcon(p.icon); return <I className="size-5 text-sky-500" strokeWidth={1.8} /> })()}
            {p.label}<span className="muted text-[11px]">{p.amount_ml} ml</span>
          </button>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); const n = Number(custom); if (n > 0) { add.mutate({ ml: sign === 'add' ? n : -n, label: 'Personalizado' }); setCustom('') } }}>
        <Input type="number" inputMode="numeric" min={10} max={5000} placeholder="Cantidad en ml" value={custom} onChange={e => setCustom(e.target.value)} />
        <Button type="submit" className="shrink-0" loading={add.isPending}><Plus className="size-5" /></Button>
      </form>
      <p className="muted mt-3 text-xs">Puedes editar tus cantidades rápidas en Hábitos → Agua.</p>
    </Sheet>
  )
}
