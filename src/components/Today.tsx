import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Moon, Timer, XCircle, Dumbbell, Droplets, Footprints, Activity, ListChecks, Plus } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { LOG_KEYS, useAction, useToday } from '../lib/queries'
import type { ActivityKind, MemberDay, MemberStatus, Rules, WaterPreset } from '../lib/types'
import { fmtLiters, fmtNum, localDateTimeToISO, nowTimeHHMM, toISODate } from '../lib/dates'
import { Button, Field, Input, Segmented, Sheet, cx } from './ui'
import { Avatar } from './Avatar'
import { celebrate } from './Celebration'

export const STATUS: Record<MemberStatus | 'recovered', { label: string; cls: string; icon: typeof Circle }> = {
  pending: { label: 'Pendiente', cls: 'bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-200', icon: Circle },
  in_progress: { label: 'En progreso', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', icon: Timer },
  completed: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', icon: CheckCircle2 },
  rest: { label: 'Descanso', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', icon: Moon },
  missed: { label: 'No cumplido', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', icon: XCircle },
  recovered: { label: 'Recuperado', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200', icon: CheckCircle2 },
}

export function StatusChip({ status }: { status: MemberStatus | 'recovered' }) {
  const s = STATUS[status]
  return <span className={cx('chip', s.cls)}><s.icon className="size-3.5" />{s.label}</span>
}

export const CONDITION_LABEL: Record<string, string> = {
  workout: 'Entrenamiento', activity: 'Actividad física', steps: 'Pasos', water: 'Agua', habits: 'Hábitos',
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

/** Tarjeta con el estado de hoy de una persona. */
export function MemberToday({ row, name, avatar, me }: { row?: MemberDay; name: string; avatar?: string | null; me?: boolean }) {
  const st = row?.status ?? 'pending'
  const d = row?.details
  const icons: Record<string, typeof Dumbbell> = { workout: Dumbbell, activity: Activity, steps: Footprints, water: Droplets, habits: ListChecks }
  return (
    <div className={cx('flex-1 rounded-2xl p-3 transition', st === 'completed' ? 'bg-emerald-50 ring-2 ring-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-800' : 'bg-fuego-50 dark:bg-noche-900')}>
      <div className="flex items-center gap-2">
        <Avatar path={avatar} name={name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{me ? 'Tú' : name}</p>
          <StatusChip status={st} />
        </div>
      </div>
      {d && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.required.map(k => {
            const I = icons[k] ?? Circle
            const ok = d.met.includes(k)
            return <span key={k} className={cx('chip', ok ? 'bg-emerald-500 text-white' : 'bg-white text-fuego-800/60 dark:bg-noche-800 dark:text-fuego-100/50')}><I className="size-3" />{CONDITION_LABEL[k]}</span>
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

export const ACTIVITY_KINDS: { value: ActivityKind; label: string; emoji: string }[] = [
  { value: 'caminata', label: 'Caminata', emoji: '🚶' }, { value: 'correr', label: 'Correr', emoji: '🏃' },
  { value: 'bicicleta', label: 'Bicicleta', emoji: '🚴' }, { value: 'cardio', label: 'Cardio', emoji: '❤️‍🔥' },
  { value: 'natacion', label: 'Natación', emoji: '🏊' }, { value: 'deporte', label: 'Deporte', emoji: '⚽' },
  { value: 'yoga', label: 'Yoga / estiramiento', emoji: '🧘' }, { value: 'pasos', label: 'Solo pasos', emoji: '👣' },
  { value: 'otro', label: 'Otro', emoji: '✨' },
]

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
              className={cx('flex min-h-16 flex-col items-center justify-center rounded-2xl text-xs font-semibold transition', kind === k.value ? 'bg-gradient-to-br from-fuego-500 to-rosa-400 text-white' : 'bg-white dark:bg-noche-800')}>
              <span className="text-xl">{k.emoji}</span>{k.label}
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
            className="flex min-h-20 flex-col items-center justify-center rounded-2xl bg-white text-sm font-semibold active:scale-95 dark:bg-noche-800">
            <span className="text-2xl">{p.icon === 'bottle' ? '🍶' : p.icon === 'cup' ? '☕' : '🥛'}</span>
            {p.label}<span className="muted text-xs">{p.amount_ml} ml</span>
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
